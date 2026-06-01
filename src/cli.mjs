import fs from "node:fs/promises";
import path from "node:path";

import { VERSION } from "./constants.mjs";
import {
  buildIndex,
  initStore,
  loadIndex,
  storeStatus,
  summarizeIndex,
} from "./indexer.mjs";
import { importMarkdownTree } from "./importer.mjs";
import { indexPath, pagesPath, parseDocId, resolveStoreRoot } from "./paths.mjs";
import { resolveLibraryName, saveAlias } from "./registry.mjs";
import { searchIndex } from "./search.mjs";
import { searchSqlite } from "./sqlite_index.mjs";

export async function runCli(argv, io = defaultIo()) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    io.out(helpText());
    return;
  }
  if (parsed.version) {
    io.out(VERSION);
    return;
  }

  const storeRoot = resolveStoreRoot(parsed.flags.store);
  const command = parsed.command;

  switch (command) {
    case "init":
      await initStore(storeRoot);
      io.out(`OpenDocu store initialized at ${storeRoot}`);
      return;

    case "index": {
      await initStore(storeRoot);
      const index = await buildIndex(storeRoot, {
        library: parsed.flags.library,
        version: parsed.flags.version,
      });
      io.out(
        [
          `Indexed ${index.stats.docs} docs, ${index.stats.chunks} chunks, ${index.stats.terms} terms`,
          `Index: ${indexPath(storeRoot)}`,
          ...index.warnings.slice(0, 8).map((warning) => `WARN: ${warning}`),
          index.warnings.length > 8
            ? `WARN: ${index.warnings.length - 8} more warnings omitted`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return;
    }

    case "alias": {
      const [alias, library] = parsed.positionals;
      if (!alias || !library) {
        throw new Error("usage: opendocu alias <alias> <library>");
      }
      await initStore(storeRoot);
      await saveAlias(storeRoot, alias, library);
      io.out(`Alias saved: ${alias} -> ${library}`);
      return;
    }

    case "resolve": {
      const [requested] = parsed.positionals;
      if (!requested) {
        throw new Error("usage: opendocu resolve <library>");
      }
      await initStore(storeRoot);
      const status = await storeStatus(storeRoot);
      const resolved = await resolveLibraryName(storeRoot, requested, status.index);
      if (parsed.flags.json) {
        io.out(JSON.stringify(resolved, null, 2));
      } else {
        io.out(`${resolved.requested} -> ${resolved.library} (${resolved.reason})`);
      }
      return;
    }

    case "import": {
      const [library, version, sourceDir] = parsed.positionals;
      if (!library || !version || !sourceDir) {
        throw new Error(
          "usage: opendocu import <library> <version> <source-dir> [--url-base <url>]",
        );
      }
      await initStore(storeRoot);
      const result = await importMarkdownTree(storeRoot, {
        library,
        version,
        sourceDir,
        urlBase: parsed.flags.urlBase,
      });
      io.out(
        `Imported ${result.written.length} docs for ${result.library}@${result.version}`,
      );
      return;
    }

    case "search": {
      const [library, ...terms] = parsed.positionals;
      if (!library || terms.length === 0) {
        throw new Error("usage: opendocu search <library> <keyword...>");
      }
      let status = null;
      if (!parsed.flags.allowStale) {
        status = await storeStatus(storeRoot);
        if (status.stale) {
          throw new Error("index is stale; run opendocu index or pass --allow-stale");
        }
      }
      status = status || (await storeStatus(storeRoot));
      const resolved = await resolveLibraryName(storeRoot, library, status.index);
      const options = {
        library: resolved.library,
        requestedLibrary: library,
        terms,
        version: parsed.flags.version,
        limit: Number(parsed.flags.limit || 10),
        match: parsed.flags.match || "auto",
      };
      let result;
      try {
        result = searchSqlite(storeRoot, options);
      } catch (error) {
        if (!/sqlite index not found/.test(error.message)) {
          throw error;
        }
        const index = await loadIndex(storeRoot);
        result = searchIndex(index, options);
      }
      if (parsed.flags.json) {
        io.out(JSON.stringify({ ...result, requested_library: library, library_resolution: resolved }, null, 2));
      } else {
        io.out(formatSearchResult({ ...result, requested_library: library, library_resolution: resolved }));
      }
      return;
    }

    case "get": {
      const [rawDocId] = parsed.positionals;
      const doc =
        parsed.flags.library || parsed.flags.version || parsed.flags.path
          ? parseGetFlags(parsed.flags)
          : parseDocId(rawDocId || "");
      const fullPath = await resolveDocFile(storeRoot, doc);
      io.out(await fs.readFile(fullPath, "utf8"));
      return;
    }

    case "list": {
      const status = await storeStatus(storeRoot);
      if (parsed.flags.json) {
        io.out(JSON.stringify(status.index ? summarizeIndex(status.index) : [], null, 2));
        return;
      }
      if (!status.index) {
        io.out("No index found. Run `opendocu index`.");
        return;
      }
      io.out(formatList(summarizeIndex(status.index)));
      return;
    }

    case "doctor": {
      const status = await storeStatus(storeRoot);
      io.out(formatDoctor(status));
      return;
    }

    default:
      throw new Error(`unknown command: ${command || "(none)"}\n\n${helpText()}`);
  }
}

function defaultIo() {
  return {
    out: (value) => process.stdout.write(`${value}\n`),
  };
}

function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  let command = "";
  let help = false;
  let version = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if ((arg === "--version" || arg === "-v") && !command) {
      version = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const [rawKey, rawValue] = arg.slice(2).split("=", 2);
      const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (rawValue !== undefined) {
        flags[key] = rawValue;
      } else if (["json", "allowStale"].includes(key)) {
        flags[key] = true;
      } else {
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) {
          throw new Error(`--${rawKey} requires a value`);
        }
        flags[key] = value;
        index += 1;
      }
      continue;
    }
    if (!command) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command, positionals, flags, help, version };
}

async function resolveDocFile(storeRoot, doc) {
  const base = pagesPath(storeRoot, doc.library, doc.version);
  const candidates = [
    path.join(base, `${doc.pagePath}.md`),
    path.join(base, `${doc.pagePath}.mdx`),
    path.join(base, `${doc.pagePath}.markdown`),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next supported extension.
    }
  }

  throw new Error(`document not found: ${doc.library}@${doc.version}/${doc.pagePath}`);
}

function parseGetFlags(flags) {
  if (!flags.library || !flags.version || !flags.path) {
    throw new Error("usage: opendocu get <library@version/path> or opendocu get --library <name> --version <version> --path <path>");
  }
  return {
    library: flags.library,
    version: flags.version,
    pagePath: flags.path,
  };
}

function formatSearchResult(result) {
  const header = [
    `Search: ${result.library} ${result.terms.join(" ")}`,
    result.library_resolution &&
    result.library_resolution.reason !== "exact" &&
    result.library_resolution.library !== result.library_resolution.requested
      ? `Resolved library: ${result.library_resolution.requested} -> ${result.library_resolution.library} (${result.library_resolution.reason})`
      : "",
    result.version ? `Version: ${result.version}` : "",
    result.version_candidates &&
    result.version_candidates.length > 0 &&
    result.version_candidates.join(", ") !== result.version
      ? `Resolved versions: ${result.version_candidates.join(", ")}`
      : "",
    `Match: ${result.match}${result.relaxed ? " (relaxed from all)" : ""}`,
    `Results: ${result.count}`,
  ]
    .filter(Boolean)
    .join("\n");

  const body = result.results
    .map((item, index) =>
      [
        "",
        `${index + 1}. ${item.title} [${item.doc_id}]`,
        `   Score: ${item.score}`,
        `   Heading: ${item.heading_path.join(" > ")}`,
        item.url ? `   Source: ${item.url}` : "",
        `   File: ${item.file}`,
        `   Snippet: ${item.snippet}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return body ? `${header}\n${body}` : header;
}

function formatList(items) {
  if (items.length === 0) {
    return "No indexed libraries.";
  }

  return items
    .map((item) => {
      const versions = item.versions
        .map((version) => `${version.version} (${version.docs} docs)`)
        .join(", ");
      return `${item.library}: ${versions}`;
    })
    .join("\n");
}

function formatDoctor(status) {
  const lines = [`Store: ${status.storeRoot}`];
  lines.push(`Docs: ${status.docFiles.length}`);
  lines.push(status.indexExists ? `JSON index: ${status.indexFile}` : "JSON index: missing");
  lines.push(status.sqliteExists ? `SQLite index: ${status.sqliteFile}` : "SQLite index: missing");
  lines.push(status.stale ? "Status: stale or missing index" : "Status: ready");
  if (status.index?.stats) {
    lines.push(
      `Indexed: ${status.index.stats.docs} docs, ${status.index.stats.chunks} chunks, ${status.index.stats.terms} terms`,
    );
  }
  if (status.index?.warnings?.length) {
    lines.push(`Warnings: ${status.index.warnings.length}`);
  }
  return lines.join("\n");
}

function helpText() {
  return `OpenDocu ${VERSION}

Usage:
  opendocu init [--store <path>]
  opendocu import <library> <version> <source-dir> [--url-base <url>] [--store <path>]
  opendocu alias <alias> <library> [--store <path>]
  opendocu resolve <library> [--store <path>] [--json]
  opendocu index [--store <path>] [--library <name>] [--version <version>]
  opendocu search <library> <keyword...> [--version <version>] [--limit <n>] [--match all|any|auto] [--json] [--allow-stale]
  opendocu get <library@version/path> [--store <path>]
  opendocu get --library <name> --version <version> --path <path> [--store <path>]
  opendocu list [--store <path>] [--json]
  opendocu doctor [--store <path>]

Search defaults to --match auto: exact all-keyword matching first, then any-keyword fallback if empty.
The CLI is deterministic. Agents choose keywords, fetch docs, and write Markdown files.`;
}
