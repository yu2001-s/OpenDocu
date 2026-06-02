import fs from "node:fs/promises";
import path from "node:path";

import { firstHeading, parseFrontmatter } from "./frontmatter.mjs";
import { pagesPath, parseDocId, semanticMapPath, toPosixPath } from "./paths.mjs";
import { normalizePhrase, tokenize } from "./tokenize.mjs";

const MAP_EXTENSION_RE = /\.(md|mdx|markdown)$/i;
const MAP_SYSTEM_FILES = new Set(["README.md", "index.md", "log.md"]);

export async function initSemanticMap(storeRoot, { library, version, now = new Date().toISOString() }) {
  const root = semanticMapPath(storeRoot, library, version);
  await fs.mkdir(root, { recursive: true });

  const readmePath = path.join(root, "README.md");
  const logPath = path.join(root, "log.md");

  await writeIfMissing(
    readmePath,
    `---
library: "${escapeYaml(library)}"
version: "${escapeYaml(version)}"
kind: "semantic-map-readme"
---

# ${library} ${version} Semantic Map

Add source-backed semantic cards under this directory only when they improve retrieval to raw docs. Cards can describe APIs, concepts, tasks, aliases, topics, and simple relationships, but they are retrieval patches rather than a complete graph. Final answers still use raw OpenDocu source docs.
`,
  );

  await writeIfMissing(
    logPath,
    `---
library: "${escapeYaml(library)}"
version: "${escapeYaml(version)}"
kind: "semantic-map-log"
---

# ${library} ${version} Semantic Map Log

## [${now}] init | semantic map created
`,
  );

  return { root, readmePath, logPath };
}

export async function listSemanticCards(storeRoot, { library, version }) {
  const root = semanticMapPath(storeRoot, library, version);
  const files = await findSemanticMapFiles(root);
  const cards = [];
  for (const filePath of files) {
    const card = await readSemanticCard(root, filePath);
    if (!card.system) {
      cards.push(card);
    }
  }
  return { root, cards };
}

export async function validateSemanticMap(storeRoot, { library, version, requireMap = true }) {
  const root = semanticMapPath(storeRoot, library, version);
  const files = await findSemanticMapFiles(root);
  const errors = [];
  const warnings = [];
  const cards = [];
  const invalidCards = [];

  if (requireMap && files.length === 0) {
    errors.push(`semantic map not found or empty: ${root}`);
  }

  for (const filePath of files) {
    const card = await readSemanticCard(root, filePath);
    if (card.system) {
      continue;
    }

    const cardErrors = [];
    const cardWarnings = [];
    if (card.library && card.library !== library) {
      cardErrors.push(`library ${card.library} does not match ${library}`);
    }
    if (card.version && card.version !== version) {
      cardErrors.push(`version ${card.version} does not match ${version}`);
    }
    if (card.sources.length === 0) {
      cardErrors.push("semantic cards must declare sources");
    }
    if (card.sourceHashes.length === 0) {
      cardErrors.push("semantic cards must declare source_hashes");
    }
    if (card.sourceHashes.length > 0 && card.sourceHashes.length !== card.sources.length) {
      cardErrors.push("source_hashes count must match sources count");
    }

    const sourceResults = [];
    for (const [index, sourceRef] of card.sources.entries()) {
      const result = await validateSourceRef(storeRoot, {
        card,
        sourceRef,
        expectedHash: card.sourceHashes[index] || "",
        expectedLibrary: library,
        expectedVersion: version,
        requireSameScope: true,
      });
      sourceResults.push(result.source);
      cardErrors.push(...result.errors);
    }

    const edgeResults = [];
    for (const edge of card.edges) {
      const result = await validateEdge(storeRoot, { card, edge, library, version });
      edgeResults.push(result.edge);
      cardErrors.push(...result.errors);
      cardWarnings.push(...result.warnings);
    }

    const normalized = {
      id: semanticCardId(library, version, card.relativePath),
      file: card.relativePath,
      title: card.title,
      kind: card.kind,
      library,
      version,
      aliases: card.aliases,
      topics: card.topics,
      sources: sourceResults,
      source_doc_ids: sourceResults.map((source) => source.doc_id).filter(Boolean),
      edges: edgeResults,
      body: card.body,
      search_text: semanticSearchText(card),
      tokens: tokenize(semanticSearchText(card)),
    };

    if (cardErrors.length > 0) {
      const messages = cardErrors.map((error) => `${card.relativePath}: ${error}`);
      errors.push(...messages);
      invalidCards.push({ ...normalized, errors: messages });
    } else {
      cards.push(normalized);
    }
    warnings.push(...cardWarnings.map((warning) => `${card.relativePath}: ${warning}`));
  }

  return {
    status: errors.length === 0 ? "pass" : "fail",
    root,
    cards,
    invalid_cards: invalidCards,
    errors,
    warnings,
  };
}

export async function buildSemanticMapIndex(storeRoot, { docs = [], library = "", version = "" } = {}) {
  const scopes = semanticScopesForDocs(docs, { library, version });
  const files = await findStoreSemanticMapFiles(storeRoot);
  const allErrors = [];
  const warnings = [];
  const cards = [];
  const invalidCards = [];

  for (const scope of scopes) {
    const result = await validateSemanticMap(storeRoot, {
      library: scope.library,
      version: scope.version,
      requireMap: false,
    });
    cards.push(...result.cards);
    invalidCards.push(...result.invalid_cards);
    allErrors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    files: files.map((filePath) => toPosixPath(path.relative(storeRoot, filePath))),
    cards,
    invalid_cards: invalidCards,
    warnings,
    errors: allErrors,
    stats: {
      active_cards: cards.length,
      invalid_cards: invalidCards.length,
      edges: cards.reduce((sum, card) => sum + card.edges.length, 0),
    },
  };
}

export function semanticMatchesFor(index, options, groups, mode) {
  const cards = index.semantic_map?.cards || [];
  const matches = [];

  for (const card of cards) {
    if (options.library && card.library !== options.library) {
      continue;
    }
    if (options.versionCandidates && !options.versionCandidates.includes(card.version)) {
      continue;
    }

    const haystack = normalizePhrase(card.search_text);
    const titleHaystack = normalizePhrase([card.title, card.aliases.join(" "), card.topics.join(" ")].join("\n"));
    const matchedGroups = groups.filter((group) => groupMatches(group, haystack));
    if (mode === "all" && matchedGroups.length < groups.length) {
      continue;
    }
    if (mode === "any" && matchedGroups.length === 0) {
      continue;
    }

    matches.push({
      card_id: card.id,
      title: card.title,
      kind: card.kind,
      file: card.file,
      library: card.library,
      version: card.version,
      sources: card.source_doc_ids,
      edges: card.edges.map((edge) => ({
        target: edge.target,
        relationship: edge.relationship,
        evidence_role: edge.evidence_role,
      })),
      score: scoreSemanticCard(card, groups, haystack, titleHaystack, matchedGroups),
      matched_terms: matchedGroups.map((group) => group.raw),
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.card_id.localeCompare(b.card_id);
  });
  return matches;
}

export async function findStoreSemanticMapFiles(storeRoot) {
  const results = [];
  const librariesRoot = path.join(storeRoot, "libraries");
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && MAP_EXTENSION_RE.test(entry.name) && isStoreSemanticMapFile(storeRoot, fullPath)) {
        results.push(fullPath);
      }
    }
  }
  await walk(librariesRoot);
  return results.sort();
}

function semanticScopesForDocs(docs, filters) {
  const scopes = new Map();
  for (const doc of docs) {
    if (filters.library && doc.library !== filters.library) {
      continue;
    }
    if (filters.version && doc.version !== filters.version) {
      continue;
    }
    scopes.set(`${doc.library}@${doc.version}`, {
      library: doc.library,
      version: doc.version,
    });
  }
  return [...scopes.values()];
}

async function validateSourceRef(storeRoot, { card, sourceRef, expectedHash, expectedLibrary, expectedVersion, requireSameScope }) {
  const sourceId = stripSourceFragment(sourceRef);
  const errors = [];
  let doc;
  try {
    doc = parseDocId(sourceId);
  } catch {
    return {
      source: { raw: sourceRef, doc_id: "", hash_ok: false },
      errors: [`invalid source id ${sourceRef}`],
    };
  }

  if (requireSameScope && (doc.library !== expectedLibrary || doc.version !== expectedVersion)) {
    errors.push(`source ${sourceRef} crosses card library/version boundary`);
  }

  const sourceFile = await resolveSourceDocFile(storeRoot, doc);
  if (!sourceFile) {
    errors.push(`source ${sourceRef} not found`);
    return {
      source: { raw: sourceRef, doc_id: sourceId, hash_ok: false },
      errors,
    };
  }

  const sourceContent = await fs.readFile(sourceFile, "utf8");
  const { data } = parseFrontmatter(sourceContent);
  const actualHash = String(data.content_hash || "").trim();
  if (!actualHash) {
    errors.push(`source ${sourceRef} is missing content_hash`);
  } else if (expectedHash && expectedHash !== actualHash) {
    errors.push(`source hash mismatch for ${sourceRef}`);
  }

  return {
    source: {
      raw: sourceRef,
      doc_id: sourceId,
      file: toPosixPath(path.relative(storeRoot, sourceFile)),
      content_hash: actualHash,
      hash_ok: Boolean(actualHash && (!expectedHash || expectedHash === actualHash)),
    },
    errors,
  };
}

async function validateEdge(storeRoot, { edge, library, version }) {
  const warnings = [];
  const errors = [];
  let doc;
  try {
    doc = parseDocId(stripSourceFragment(edge.target));
  } catch {
    return {
      edge: { ...edge, valid: false },
      errors: [`invalid edge target ${edge.target}`],
      warnings,
    };
  }

  const sameScope = doc.library === library && doc.version === version;
  if (!sameScope && !edge.relationship) {
    errors.push(`cross-scope edge ${edge.target} must declare a relationship`);
  }
  if (!sameScope && !["context_only", "version_contrast"].includes(edge.evidence_role)) {
    errors.push(`cross-scope edge ${edge.target} must be context_only or version_contrast`);
  }

  const targetFile = await resolveSourceDocFile(storeRoot, doc);
  if (!targetFile) {
    errors.push(`edge target ${edge.target} not found`);
  }
  if (sameScope && edge.evidence_role !== "context_only") {
    warnings.push(`same-scope edge ${edge.target} uses ${edge.evidence_role}; context_only is the default`);
  }

  return {
    edge: {
      ...edge,
      doc_id: stripSourceFragment(edge.target),
      library: doc.library,
      version: doc.version,
      valid: errors.length === 0,
    },
    errors,
    warnings,
  };
}

async function readSemanticCard(root, filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const { data, body } = parseFrontmatter(content);
  const relativePath = toPosixPath(path.relative(root, filePath));
  return {
    file: filePath,
    relativePath,
    system: MAP_SYSTEM_FILES.has(relativePath),
    library: String(data.library || "").trim(),
    version: String(data.version || "").trim(),
    title: String(data.title || "").trim() || firstHeading(body) || titleFromPath(relativePath),
    kind: String(data.kind || "").trim() || "semantic-card",
    aliases: parseList(data.aliases),
    topics: parseList(data.topics),
    sources: parseList(data.sources),
    sourceHashes: parseList(data.source_hashes),
    edges: parseEdges(data.edges),
    body,
  };
}

async function findSemanticMapFiles(root) {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && MAP_EXTENSION_RE.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  await walk(root);
  return results.sort();
}

async function resolveSourceDocFile(storeRoot, doc) {
  const base = path.resolve(pagesPath(storeRoot, doc.library, doc.version));
  const candidates = [
    path.resolve(base, `${doc.pagePath}.md`),
    path.resolve(base, `${doc.pagePath}.mdx`),
    path.resolve(base, `${doc.pagePath}.markdown`),
  ];
  for (const candidate of candidates) {
    if (!isPathInside(candidate, base)) {
      return "";
    }
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next extension.
    }
  }
  return "";
}

function semanticSearchText(card) {
  return [
    card.title,
    card.kind,
    card.relativePath,
    card.aliases.join(" "),
    card.topics.join(" "),
    card.sources.join(" "),
    card.edges.map((edge) => [edge.target, edge.relationship, edge.evidence_role].join(" ")).join(" "),
    card.body,
  ]
    .filter(Boolean)
    .join("\n");
}

function semanticCardId(library, version, relativePath) {
  const withoutExtension = relativePath.replace(MAP_EXTENSION_RE, "");
  return `${library}@${version}#${withoutExtension}`;
}

function isStoreSemanticMapFile(storeRoot, filePath) {
  const relative = toPosixPath(path.relative(path.join(storeRoot, "libraries"), filePath));
  const parts = relative.split("/");
  return parts[1] === "versions" && parts[3] === "map" && parts.length > 4;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEdges(value) {
  return parseList(value).map((item) => {
    const [target, relationship = "related_api", evidenceRole = "context_only"] = item
      .split("|")
      .map((part) => part.trim());
    return {
      target,
      relationship,
      evidence_role: evidenceRole,
    };
  });
}

function stripSourceFragment(sourceRef) {
  return String(sourceRef).split("#", 1)[0];
}

function groupMatches(group, haystack) {
  return (
    group.tokens.some((token) => haystack.includes(token)) ||
    (group.phrase && haystack.includes(group.phrase))
  );
}

function scoreSemanticCard(card, groups, haystack, titleHaystack, matchedGroups) {
  let score = matchedGroups.length * 8;
  const cardTokens = new Set(card.tokens || []);
  for (const group of groups) {
    if (group.phrase && haystack.includes(group.phrase)) {
      score += 4;
    }
    if (group.phrase && titleHaystack.includes(group.phrase)) {
      score += 12;
    }
    for (const token of group.tokens) {
      if (cardTokens.has(token)) {
        score += 3;
      }
    }
  }
  if (matchedGroups.length === groups.length) {
    score += groups.length * 2;
  }
  return Number(score.toFixed(6));
}

function titleFromPath(pagePath) {
  return path
    .basename(pagePath)
    .replace(MAP_EXTENSION_RE, "")
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

async function writeIfMissing(filePath, content) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content);
  }
}

function isPathInside(candidate, base) {
  const relative = path.relative(base, candidate);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function escapeYaml(value) {
  return String(value).replace(/"/g, '\\"');
}
