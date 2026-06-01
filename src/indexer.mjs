import fs from "node:fs/promises";
import path from "node:path";

import {
  INDEX_SCHEMA_VERSION,
  SUPPORTED_DOC_EXTENSIONS,
} from "./constants.mjs";
import { parseMarkdownFile } from "./markdown.mjs";
import { indexPath, librariesPath, registryPath, sqliteIndexPath, toPosixPath } from "./paths.mjs";
import { writeSqliteIndex } from "./sqlite_index.mjs";
import { tokenCounts, tokenize } from "./tokenize.mjs";

export async function initStore(storeRoot) {
  await fs.mkdir(path.join(storeRoot, "libraries"), { recursive: true });
  await fs.mkdir(path.join(storeRoot, "index"), { recursive: true });
  try {
    const registry = JSON.parse(await fs.readFile(registryPath(storeRoot), "utf8"));
    if (!registry.aliases) {
      registry.aliases = {};
      await fs.writeFile(registryPath(storeRoot), `${JSON.stringify(registry, null, 2)}\n`);
    }
  } catch {
    const registry = {
      schema_version: 1,
      created_at: new Date().toISOString(),
      aliases: {},
      note: "OpenDocu Markdown files are the source of truth. Index files are derived.",
    };
    await fs.writeFile(registryPath(storeRoot), `${JSON.stringify(registry, null, 2)}\n`);
  }
}

export async function buildIndex(storeRoot, options = {}) {
  const startedAt = new Date().toISOString();
  const files = await findDocFiles(librariesPath(storeRoot));
  const docs = [];
  const chunks = [];
  const postings = Object.create(null);
  const warnings = [];
  let totalTokenLength = 0;

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = parseMarkdownFile(storeRoot, filePath, content);

    if (options.library && parsed.doc.library !== options.library) {
      continue;
    }
    if (options.version && parsed.doc.version !== options.version) {
      continue;
    }

    if (!parsed.frontmatter.url && !parsed.frontmatter.source_url) {
      warnings.push(`${parsed.doc.file}: missing url/source_url frontmatter`);
    }
    if (!parsed.frontmatter.version) {
      warnings.push(`${parsed.doc.file}: missing version frontmatter; derived from path`);
    }

    docs.push(parsed.doc);

    for (const chunk of parsed.chunks) {
      const searchableText = searchableChunkText(chunk);
      const counts = tokenCounts(searchableText);
      const chunkIndex = chunks.length;
      const tokenLength = [...counts.values()].reduce((sum, value) => sum + value, 0);
      totalTokenLength += tokenLength;

      chunks.push({
        ...chunk,
        tokenLength,
        titleTokens: tokenize(chunk.title),
        headingTokens: tokenize(chunk.headingPath.join(" ")),
        urlTokens: tokenize(chunk.url),
      });

      for (const [token, count] of counts) {
        if (!postings[token]) {
          postings[token] = {
            df: 0,
            hits: [],
          };
        }
        postings[token].df += 1;
        postings[token].hits.push([chunkIndex, count]);
      }
    }
  }

  const index = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    generatedAt: startedAt,
    storeRoot,
    docs,
    chunks,
    postings,
    stats: {
      docs: docs.length,
      chunks: chunks.length,
      terms: Object.keys(postings).length,
      avgChunkTokens: chunks.length ? totalTokenLength / chunks.length : 0,
    },
    warnings,
  };

  await fs.mkdir(path.dirname(indexPath(storeRoot)), { recursive: true });
  await fs.writeFile(indexPath(storeRoot), `${JSON.stringify(index)}\n`);
  await writeSqliteIndex(storeRoot, index);
  return index;
}

export async function loadIndex(storeRoot) {
  const raw = await fs.readFile(indexPath(storeRoot), "utf8");
  const index = JSON.parse(raw);
  if (index.schemaVersion !== INDEX_SCHEMA_VERSION) {
    throw new Error(
      `index schema ${index.schemaVersion} is not supported; run opendocu index`,
    );
  }
  return index;
}

export async function storeStatus(storeRoot) {
  const docFiles = await findDocFiles(librariesPath(storeRoot));
  const currentFiles = new Set(docFiles.map((filePath) => relativeDisplay(storeRoot, filePath)));
  const indexFile = indexPath(storeRoot);
  const sqliteFile = sqliteIndexPath(storeRoot);
  let index = null;
  let indexMtimeMs = 0;
  let indexExists = false;
  let sqliteExists = false;
  let stale = false;

  try {
    const stat = await fs.stat(indexFile);
    indexExists = true;
    indexMtimeMs = stat.mtimeMs;
    index = JSON.parse(await fs.readFile(indexFile, "utf8"));
  } catch {
    index = null;
  }

  try {
    const sqliteStat = await fs.stat(sqliteFile);
    sqliteExists = sqliteStat.isFile();
    if (indexExists && sqliteStat.mtimeMs < indexMtimeMs) {
      stale = true;
    }
  } catch {
    sqliteExists = false;
  }

  for (const filePath of docFiles) {
    const stat = await fs.stat(filePath);
    if (!indexExists || stat.mtimeMs > indexMtimeMs) {
      stale = true;
      break;
    }
  }
  if (index?.docs) {
    const indexedFiles = new Set(index.docs.map((doc) => doc.file));
    if (indexedFiles.size !== currentFiles.size) {
      stale = true;
    } else {
      for (const file of indexedFiles) {
        if (!currentFiles.has(file)) {
          stale = true;
          break;
        }
      }
    }
  }
  if (!indexExists || !sqliteExists) {
    stale = true;
  }

  return {
    storeRoot,
    docFiles,
    currentFiles: [...currentFiles],
    indexFile,
    sqliteFile,
    indexExists,
    sqliteExists,
    stale,
    index,
  };
}

export async function findDocFiles(root) {
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
      } else if (entry.isFile() && SUPPORTED_DOC_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results.sort();
}

export function searchableChunkText(chunk) {
  return [
    chunk.title,
    chunk.headingPath.join(" "),
    chunk.url,
    chunk.file,
    chunk.text,
  ]
    .filter(Boolean)
    .join("\n");
}

export function summarizeIndex(index) {
  const libraries = new Map();
  for (const doc of index.docs || []) {
    if (!libraries.has(doc.library)) {
      libraries.set(doc.library, new Map());
    }
    const versions = libraries.get(doc.library);
    versions.set(doc.version, (versions.get(doc.version) || 0) + 1);
  }

  return [...libraries.entries()].map(([library, versions]) => ({
    library,
    versions: [...versions.entries()].map(([version, docs]) => ({ version, docs })),
  }));
}

export function relativeDisplay(storeRoot, filePath) {
  return toPosixPath(path.relative(storeRoot, filePath));
}
