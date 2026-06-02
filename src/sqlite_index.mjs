import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { sqliteIndexPath } from "./paths.mjs";
import { makeSnippet } from "./search.mjs";
import { exactPhraseBoost, normalizePhrase, queryGroups, tokenize } from "./tokenize.mjs";
import { resolveVersionCandidates } from "./versioning.mjs";

const TOKENIZER = "unicode61 tokenchars ''.:@_/#$-''";

export async function writeSqliteIndex(storeRoot, index) {
  const finalPath = sqliteIndexPath(storeRoot);
  const tmpPath = `${finalPath}.tmp`;
  await fsPromises.mkdir(path.dirname(finalPath), { recursive: true });
  await fsPromises.rm(tmpPath, { force: true });

  const db = new DatabaseSync(tmpPath);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec(`CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.exec(`CREATE TABLE docs (
      id TEXT PRIMARY KEY,
      library TEXT NOT NULL,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      retrieved_at TEXT,
      content_hash TEXT,
      file TEXT NOT NULL,
      page_path TEXT NOT NULL
    )`);
    db.exec(`CREATE TABLE chunks (
      doc_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL UNIQUE,
      ordinal INTEGER NOT NULL,
      library TEXT NOT NULL,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      heading TEXT NOT NULL,
      heading_path TEXT NOT NULL,
      url TEXT,
      file TEXT NOT NULL,
      text TEXT NOT NULL
    )`);
    db.exec(
      `CREATE VIRTUAL TABLE chunks_fts USING fts5(title, heading, url, file, text, tokenize='${TOKENIZER}')`,
    );
    db.exec(`CREATE INDEX idx_chunks_scope ON chunks(library, version)`);

    const insertMeta = db.prepare(`INSERT INTO metadata(key, value) VALUES (?, ?)`);
    insertMeta.run("schemaVersion", String(index.schemaVersion));
    insertMeta.run("generatedAt", index.generatedAt);
    insertMeta.run("stats", JSON.stringify(index.stats));
    insertMeta.run("warnings", JSON.stringify(index.warnings || []));

    const insertDoc = db.prepare(`INSERT INTO docs(
      id, library, version, title, url, retrieved_at, content_hash, file, page_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertChunk = db.prepare(`INSERT INTO chunks(
      doc_id, chunk_id, ordinal, library, version, title, heading, heading_path, url, file, text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertFts = db.prepare(
      `INSERT INTO chunks_fts(rowid, title, heading, url, file, text) VALUES (?, ?, ?, ?, ?, ?)`,
    );

    db.exec("BEGIN");
    try {
      for (const doc of index.docs) {
        insertDoc.run(
          doc.id,
          doc.library,
          doc.version,
          doc.title,
          doc.url,
          doc.retrievedAt,
          doc.contentHash,
          doc.file,
          doc.pagePath,
        );
      }
      for (const chunk of index.chunks) {
        const result = insertChunk.run(
          chunk.docId,
          chunk.id,
          chunk.ordinal,
          chunk.library,
          chunk.version,
          chunk.title,
          chunk.heading,
          JSON.stringify(chunk.headingPath),
          chunk.url,
          chunk.file,
          chunk.text,
        );
        const augmentedText = `${chunk.text}\n\n${tokenize(searchableTextForFts(chunk)).join(" ")}`;
        insertFts.run(
          result.lastInsertRowid,
          chunk.title,
          chunk.headingPath.join(" "),
          chunk.url,
          chunk.file,
          augmentedText,
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }

  await fsPromises.rm(finalPath, { force: true });
  await fsPromises.rename(tmpPath, finalPath);
  await fsPromises.rm(`${tmpPath}-wal`, { force: true });
  await fsPromises.rm(`${tmpPath}-shm`, { force: true });
}

export function searchSqlite(storeRoot, options) {
  const dbPath = sqliteIndexPath(storeRoot);
  if (!fs.existsSync(dbPath)) {
    throw new Error("sqlite index not found; run opendocu index");
  }

  const groups = queryGroups(options.terms || []);
  if (groups.length === 0) {
    throw new Error("search requires at least one keyword");
  }

  const requestedMode = options.match || "all";
  const strict = runSqliteSearch(dbPath, options, groups, requestedMode === "auto" ? "all" : requestedMode);
  if (strict.results.length > 0 || requestedMode !== "auto") {
    return strict;
  }
  return {
    ...runSqliteSearch(dbPath, options, groups, "any"),
    relaxed: true,
  };
}

function runSqliteSearch(dbPath, options, groups, mode) {
  if (!["all", "any"].includes(mode)) {
    throw new Error("--match must be all, any, or auto");
  }

  const matchQuery = groupsToFtsQuery(groups, mode);
  const limit = Number(options.limit || 10);
  const fetchLimit = Math.max(limit, Math.min(100, limit * 20));

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const versionCandidates = resolveVersionCandidates(
      availableVersions(db, options.library),
      options.version,
    );
    const scope = versionScopeSql(versionCandidates);
    const countRow = db
      .prepare(`SELECT count(*) AS count
        FROM chunks_fts
        JOIN chunks ON chunks.rowid = chunks_fts.rowid
        WHERE chunks_fts MATCH ?
          AND chunks.library = ?
          ${scope.sql}`)
      .get(matchQuery, options.library, ...scope.params);

    const rows = db
      .prepare(`SELECT
          chunks.doc_id,
          chunks.chunk_id,
          chunks.library,
          chunks.version,
          chunks.title,
          chunks.heading,
          chunks.heading_path,
          chunks.url,
          chunks.file,
          chunks.text,
          bm25(chunks_fts, 5.0, 3.0, 1.0, 0.5, 1.0) AS rank
        FROM chunks_fts
        JOIN chunks ON chunks.rowid = chunks_fts.rowid
        WHERE chunks_fts MATCH ?
          AND chunks.library = ?
          ${scope.sql}
        ORDER BY rank ASC, chunks.doc_id ASC, chunks.ordinal ASC
        LIMIT ?`)
      .all(matchQuery, options.library, ...scope.params, fetchLimit);

    const results = rows
      .map((row) => rowToResult(row, groups))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.doc_id.localeCompare(b.doc_id);
      })
      .slice(0, limit);

    return {
      library: options.library,
      version: options.version || null,
      version_candidates: versionCandidates,
      terms: options.terms,
      match: mode,
      count: countRow?.count || 0,
      results,
    };
  } finally {
    db.close();
  }
}

function availableVersions(db, library) {
  return db
    .prepare("SELECT DISTINCT version FROM docs WHERE library = ? ORDER BY version")
    .all(library)
    .map((row) => row.version);
}

function versionScopeSql(versionCandidates) {
  if (versionCandidates === null) {
    return { sql: "", params: [] };
  }
  if (versionCandidates.length === 0) {
    return { sql: "AND 1 = 0", params: [] };
  }
  return {
    sql: `AND chunks.version IN (${versionCandidates.map(() => "?").join(", ")})`,
    params: versionCandidates,
  };
}

function groupsToFtsQuery(groups, mode) {
  const clauses = groups.map((group) => {
    const tokens = [...new Set(group.tokens)];
    if (tokens.length === 1) {
      return quoteFtsToken(tokens[0]);
    }
    return `(${tokens.map(quoteFtsToken).join(" OR ")})`;
  });
  return clauses.join(mode === "all" ? " AND " : " OR ");
}

function quoteFtsToken(token) {
  return `"${token.replace(/"/g, '""')}"`;
}

function rowToResult(row, groups) {
  const headingPath = JSON.parse(row.heading_path);
  const haystack = normalizePhrase(
    [row.title, headingPath.join(" "), row.url, row.file, row.text].filter(Boolean).join("\n"),
  );
  const headingHaystack = normalizePhrase([row.title, headingPath.join(" ")].join("\n"));
  const matchedTerms = groups
    .filter((group) =>
      group.tokens.some((token) => haystack.includes(token)) ||
      (group.phrase && haystack.includes(group.phrase)),
    )
    .map((group) => group.raw);
  const headingBoost = groups.reduce((sum, group) => {
    let boost = 0;
    if (group.phrase && headingHaystack.includes(group.phrase)) {
      boost += 12;
    }
    if (group.tokens.some((token) => headingHaystack.includes(token))) {
      boost += 4;
    }
    return sum + boost;
  }, 0);
  const phraseBoost = groups.reduce(
    (sum, group) => sum + (group.phrase && haystack.includes(group.phrase) ? exactPhraseBoost(group) : 0),
    0,
  );

  return {
    score: Number((-row.rank + headingBoost + phraseBoost).toFixed(6)),
    doc_id: row.doc_id,
    chunk_id: row.chunk_id,
    library: row.library,
    version: row.version,
    title: row.title,
    heading: row.heading,
    heading_path: headingPath,
    url: row.url,
    file: row.file,
    snippet: makeSnippet(row.text, groups),
    matched_terms: matchedTerms,
  };
}

function searchableTextForFts(chunk) {
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
