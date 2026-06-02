import { exactPhraseBoost, normalizePhrase, queryGroups } from "./tokenize.mjs";
import { semanticMatchesFor } from "./semantic_map.mjs";
import { resolveVersionCandidates } from "./versioning.mjs";

const K1 = 1.4;
const B = 0.72;

export function searchIndex(index, options) {
  const groups = queryGroups(options.terms || []);
  if (groups.length === 0) {
    throw new Error("search requires at least one keyword");
  }

  const scopedOptions = {
    ...options,
    versionCandidates: resolveVersionCandidates(
      availableVersions(index, options.library),
      options.version,
    ),
  };
  const mode = options.match || "all";
  if (!["all", "any", "auto"].includes(mode)) {
    throw new Error("--match must be all, any, or auto");
  }

  const strict = runSearch(index, scopedOptions, groups, mode === "auto" ? "all" : mode);
  if (strict.results.length > 0 || mode !== "auto") {
    return strict;
  }

  const relaxed = runSearch(index, scopedOptions, groups, "any");
  return {
    ...relaxed,
    relaxed: true,
  };
}

function runSearch(index, options, groups, mode) {
  const chunks = index.chunks || [];
  const postings = index.postings || {};
  const candidates = new Map();
  const semanticMatches = semanticMatchesFor(index, options, groups, mode);
  const semanticByDoc = semanticMatchesByDoc(semanticMatches);

  for (const group of groups) {
    for (const token of group.tokens) {
      const posting = postings[token];
      if (!posting) {
        continue;
      }
      for (const [chunkIndex, count] of posting.hits) {
        const chunk = chunks[chunkIndex];
        if (!chunkMatchesScope(chunk, options)) {
          continue;
        }
        if (!candidates.has(chunkIndex)) {
          candidates.set(chunkIndex, {
            chunkIndex,
            tokenCounts: new Map(),
            matchedGroups: new Set(),
          });
        }
        const candidate = candidates.get(chunkIndex);
        candidate.tokenCounts.set(token, (candidate.tokenCounts.get(token) || 0) + count);
        candidate.matchedGroups.add(group.raw);
      }
    }
  }

  const docToChunks = chunkIndexesByDoc(chunks, options);
  for (const candidate of candidates.values()) {
    const chunk = chunks[candidate.chunkIndex];
    applySemanticMatches(candidate, semanticByDoc.get(chunk.docId));
  }
  for (const [docId, matches] of semanticByDoc) {
    const alreadyPresent = [...candidates.values()].some((candidate) => chunks[candidate.chunkIndex]?.docId === docId);
    if (alreadyPresent) {
      continue;
    }
    const firstChunkIndex = docToChunks.get(docId)?.[0];
    if (firstChunkIndex === undefined) {
      continue;
    }
    const candidate = {
      chunkIndex: firstChunkIndex,
      tokenCounts: new Map(),
      matchedGroups: new Set(),
    };
    applySemanticMatches(candidate, matches);
    candidates.set(firstChunkIndex, candidate);
  }

  const results = [];
  for (const candidate of candidates.values()) {
    if (mode === "all" && candidate.matchedGroups.size < groups.length) {
      continue;
    }
    const chunk = chunks[candidate.chunkIndex];
    const score = scoreCandidate(index, chunk, candidate, groups);
    results.push({
      score,
      doc_id: chunk.docId,
      chunk_id: chunk.id,
      library: chunk.library,
      version: chunk.version,
      title: chunk.title,
      heading: chunk.heading,
      heading_path: chunk.headingPath,
      url: chunk.url,
      file: chunk.file,
      snippet: makeSnippet(chunk.text, groups),
      matched_terms: [...candidate.matchedGroups],
      semantic_matches: (candidate.semanticMatches || []).map((match) => ({
        card_id: match.card_id,
        title: match.title,
        kind: match.kind,
        file: match.file,
        edges: match.edges,
        matched_terms: match.matched_terms,
      })),
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.doc_id.localeCompare(b.doc_id);
  });

  const limit = options.limit || 10;
  return {
    library: options.library,
    version: options.version || null,
    version_candidates: options.versionCandidates,
    terms: options.terms,
    match: mode,
    count: results.length,
    results: results.slice(0, limit),
    semantic_matches: semanticMatches.slice(0, 10),
    semantic_map: {
      active_cards: index.semantic_map?.stats?.active_cards || 0,
      invalid_cards: index.semantic_map?.stats?.invalid_cards || 0,
      matched_cards: semanticMatches.length,
    },
  };
}

function chunkMatchesScope(chunk, options) {
  if (options.library && chunk.library !== options.library) {
    return false;
  }
  if (options.versionCandidates && !options.versionCandidates.includes(chunk.version)) {
    return false;
  }
  return true;
}

function availableVersions(index, library) {
  return (index.docs || [])
    .filter((doc) => doc.library === library)
    .map((doc) => doc.version);
}

function scoreCandidate(index, chunk, candidate, groups) {
  const totalChunks = Math.max(1, index.stats?.chunks || index.chunks?.length || 1);
  const avgLength = Math.max(1, index.stats?.avgChunkTokens || 1);
  const length = Math.max(1, chunk.tokenLength || 1);
  let score = 0;

  for (const [token, tf] of candidate.tokenCounts) {
    const df = Math.max(1, index.postings[token]?.df || 1);
    const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5));
    score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (length / avgLength))));

    if (chunk.titleTokens?.includes(token)) {
      score += idf * 3.5;
    }
    if (chunk.headingTokens?.includes(token)) {
      score += idf * 2.2;
    }
    if (chunk.urlTokens?.includes(token)) {
      score += idf * 1.2;
    }
  }

  const haystack = normalizePhrase(
    [chunk.title, chunk.headingPath?.join(" "), chunk.url, chunk.file, chunk.text]
      .filter(Boolean)
      .join("\n"),
  );

  for (const group of groups) {
    if (group.phrase && haystack.includes(group.phrase)) {
      score += exactPhraseBoost(group);
    }
  }

  if (candidate.matchedGroups.size === groups.length) {
    score += groups.length;
  }
  if (candidate.semanticMatches?.length) {
    score += Math.max(...candidate.semanticMatches.map((match) => match.score)) * 0.75 + 6;
  }

  return Number(score.toFixed(6));
}

function semanticMatchesByDoc(matches) {
  const byDoc = new Map();
  for (const match of matches) {
    for (const docId of match.sources) {
      if (!byDoc.has(docId)) {
        byDoc.set(docId, []);
      }
      byDoc.get(docId).push(match);
    }
  }
  return byDoc;
}

function chunkIndexesByDoc(chunks, options) {
  const byDoc = new Map();
  for (const [index, chunk] of chunks.entries()) {
    if (!chunkMatchesScope(chunk, options)) {
      continue;
    }
    if (!byDoc.has(chunk.docId)) {
      byDoc.set(chunk.docId, []);
    }
    byDoc.get(chunk.docId).push(index);
  }
  return byDoc;
}

function applySemanticMatches(candidate, matches = []) {
  if (matches.length === 0) {
    return;
  }
  candidate.semanticMatches = [...(candidate.semanticMatches || []), ...matches];
  for (const match of matches) {
    for (const term of match.matched_terms) {
      candidate.matchedGroups.add(term);
    }
  }
}

export function makeSnippet(text, groups) {
  const normalized = text.toLowerCase();
  let index = -1;

  for (const group of groups) {
    const phrase = group.phrase;
    if (!phrase) {
      continue;
    }
    index = normalized.indexOf(phrase);
    if (index !== -1) {
      break;
    }
  }

  if (index === -1) {
    for (const group of groups) {
      for (const token of group.tokens) {
        index = normalized.indexOf(token);
        if (index !== -1) {
          break;
        }
      }
      if (index !== -1) {
        break;
      }
    }
  }

  const start = Math.max(0, (index === -1 ? 0 : index) - 160);
  const end = Math.min(text.length, start + 420);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`.replace(/\s+/g, " ").trim();
}
