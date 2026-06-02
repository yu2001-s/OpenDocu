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
import { importHtmlTree, importMarkdownTree } from "./importer.mjs";
import { indexPath, pagesPath, parseDocId, resolveStoreRoot, sqliteIndexPath } from "./paths.mjs";
import { resolveLibraryName, saveAlias } from "./registry.mjs";
import { searchIndex } from "./search.mjs";
import { searchSqlite } from "./sqlite_index.mjs";
import { initSemanticMap, listSemanticCards, validateSemanticMap } from "./semantic_map.mjs";

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
          `Raw-doc search index: ready`,
          `  SQLite artifact: ${sqliteIndexPath(storeRoot)}`,
          `  JSON debug artifact: ${indexPath(storeRoot)}`,
          `Semantic map: ${index.semantic_map.stats.active_cards} active, ${index.semantic_map.stats.invalid_cards} invalid/excluded`,
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

    case "import-html": {
      const [library, version, sourceDir] = parsed.positionals;
      if (!library || !version || !sourceDir) {
        throw new Error(
          "usage: opendocu import-html <library> <version> <source-dir> [--url-base <url>]",
        );
      }
      await initStore(storeRoot);
      const result = await importHtmlTree(storeRoot, {
        library,
        version,
        sourceDir,
        urlBase: parsed.flags.urlBase,
      });
      io.out(
        `Imported ${result.written.length} HTML docs for ${result.library}@${result.version}`,
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
      const index = status.index || (await loadIndex(storeRoot));
      if (index.semantic_map?.stats?.active_cards > 0) {
        result = searchIndex(index, options);
      } else {
        try {
          result = searchSqlite(storeRoot, options);
        } catch (error) {
          if (!/sqlite index not found/.test(error.message)) {
            throw error;
          }
          result = searchIndex(index, options);
        }
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

    case "map":
      await runMapCli(storeRoot, parsed, io);
      return;

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
    if (arg === "--" && command) {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const [rawKey, rawValue] = arg.slice(2).split("=", 2);
      const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const kind = flagKind(command, key);
      if (!kind && command === "search") {
        positionals.push(arg);
        continue;
      }
      if (rawValue !== undefined) {
        if (!kind && command) {
          throw new Error(`unknown option: --${rawKey}`);
        }
        flags[key] = rawValue;
      } else if (kind === "boolean") {
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

function flagKind(command, key) {
  const booleanFlags = {
    resolve: new Set(["json"]),
    search: new Set(["json", "allowStale"]),
    list: new Set(["json"]),
    map: new Set(["json"]),
  };
  const valueFlags = {
    "": new Set(["store"]),
    init: new Set(["store"]),
    index: new Set(["store", "library", "version"]),
    alias: new Set(["store"]),
    resolve: new Set(["store"]),
    import: new Set(["store", "urlBase"]),
    "import-html": new Set(["store", "urlBase"]),
    search: new Set(["store", "version", "limit", "match"]),
    get: new Set(["store", "library", "version", "path"]),
    list: new Set(["store"]),
    doctor: new Set(["store"]),
    map: new Set(["store", "version"]),
  };

  if (booleanFlags[command]?.has(key)) {
    return "boolean";
  }
  if (valueFlags[command || ""]?.has(key)) {
    return "value";
  }
  return "";
}

async function resolveDocFile(storeRoot, doc) {
  const base = path.resolve(pagesPath(storeRoot, doc.library, doc.version));
  const candidates = [
    path.resolve(base, `${doc.pagePath}.md`),
    path.resolve(base, `${doc.pagePath}.mdx`),
    path.resolve(base, `${doc.pagePath}.markdown`),
  ];

  for (const candidate of candidates) {
    if (!isPathInside(candidate, base)) {
      throw new Error(`document path escapes library pages: ${doc.pagePath}`);
    }
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

function isPathInside(candidate, base) {
  const relative = path.relative(base, candidate);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
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

async function runMapCli(storeRoot, parsed, io) {
  const [subcommand, library, ...rest] = parsed.positionals;
  switch (subcommand) {
    case "init": {
      const [version] = rest;
      if (!library || !version) {
        throw new Error("usage: opendocu map init <library> <version>");
      }
      await initStore(storeRoot);
      const result = await initSemanticMap(storeRoot, { library, version });
      io.out(`OpenDocu semantic map initialized at ${result.root}`);
      return;
    }

    case "validate": {
      const version = parsed.flags.version;
      if (!library || !version) {
        throw new Error("usage: opendocu map validate <library> --version <version> [--json]");
      }
      const canonicalLibrary = await resolveLibraryForMap(storeRoot, library);
      const result = await validateSemanticMap(storeRoot, { library: canonicalLibrary.library, version });
      if (parsed.flags.json) {
        io.out(JSON.stringify({ ...result, requested_library: library, library_resolution: canonicalLibrary }, null, 2));
      } else {
        io.out(formatMapValidation({ ...result, requested_library: library, library_resolution: canonicalLibrary }));
      }
      if (result.errors.length > 0) {
        throw new Error("semantic map validation failed");
      }
      return;
    }

    case "list": {
      const version = parsed.flags.version;
      if (!library || !version) {
        throw new Error("usage: opendocu map list <library> --version <version> [--json]");
      }
      const canonicalLibrary = await resolveLibraryForMap(storeRoot, library);
      const result = await listSemanticCards(storeRoot, { library: canonicalLibrary.library, version });
      if (parsed.flags.json) {
        io.out(JSON.stringify({ ...result, requested_library: library, library_resolution: canonicalLibrary }, null, 2));
      } else {
        io.out(formatMapList({ ...result, requested_library: library, library_resolution: canonicalLibrary }));
      }
      return;
    }

    default:
      throw new Error("usage: opendocu map <init|validate|list> ...");
  }
}

async function resolveLibraryForMap(storeRoot, requested) {
  const status = await storeStatus(storeRoot);
  return resolveLibraryName(storeRoot, requested, status.index);
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
    result.semantic_map?.active_cards
      ? `Semantic map: ${result.semantic_map.active_cards} active, ${result.semantic_map.matched_cards} matched`
      : "",
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
        item.semantic_matches?.length
          ? `   Semantic routing: ${item.semantic_matches.map((match) => `${match.title} (${match.file})`).join(", ")}`
          : "",
        `   Snippet: ${item.snippet}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return body ? `${header}\n${body}` : header;
}

function formatMapValidation(result) {
  const lines = [
    `Semantic map: ${result.root}`,
    `Status: ${result.status}`,
    `Active cards: ${result.cards.length}`,
    `Invalid cards: ${result.invalid_cards.length}`,
  ];
  if (result.errors.length > 0) {
    lines.push("Errors:");
    lines.push(...result.errors.map((error) => `- ${error}`));
  }
  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...result.warnings.map((warning) => `- ${warning}`));
  }
  return lines.join("\n");
}

function formatMapList(result) {
  if (result.cards.length === 0) {
    return `No semantic cards found at ${result.root}`;
  }
  return result.cards
    .map((card) => `${card.relativePath}: ${card.title} (${card.kind})`)
    .join("\n");
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
  lines.push(`Raw docs: ${status.docFiles.length}`);
  lines.push("Raw-doc search index:");
  lines.push(status.sqliteExists ? `  SQLite artifact: ${status.sqliteFile}` : "  SQLite artifact: missing");
  lines.push(status.indexExists ? `  JSON debug artifact: ${status.indexFile}` : "  JSON debug artifact: missing");
  lines.push(status.stale ? "Status: stale or missing raw-doc index" : "Status: ready");
  if (status.index?.stats) {
    lines.push(
      `Indexed: ${status.index.stats.docs} docs, ${status.index.stats.chunks} chunks, ${status.index.stats.terms} terms`,
    );
    lines.push(
      `Semantic map: ${status.index.semantic_map?.stats?.active_cards || 0} active, ${status.index.semantic_map?.stats?.invalid_cards || 0} invalid/excluded`,
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
  Raw official docs:
  opendocu init [--store <path>]
  opendocu import <library> <version> <source-dir> [--url-base <url>] [--store <path>]
  opendocu import-html <library> <version> <source-dir> [--url-base <url>] [--store <path>]
  opendocu alias <alias> <library> [--store <path>]
  opendocu resolve <library> [--store <path>] [--json]
  opendocu index [--store <path>] [--library <name>] [--version <version>]
  opendocu search <library> <keyword...> [--version <version>] [--limit <n>] [--match all|any|auto] [--json] [--allow-stale]
  opendocu get <library@version/path> [--store <path>]
  opendocu get --library <name> --version <version> --path <path> [--store <path>]

  Retrieval repair metadata:
  opendocu map init <library> <version> [--store <path>]
  opendocu map validate <library> --version <version> [--json] [--store <path>]
  opendocu map list <library> --version <version> [--json] [--store <path>]

  Store health:
  opendocu list [--store <path>] [--json]
  opendocu doctor [--store <path>]

Run opendocu index after importing or editing raw docs or semantic cards. It builds both raw-doc search artifacts and activates valid semantic map cards.
Search defaults to --match auto: exact all-keyword matching first, then any-keyword fallback if empty.
Semantic cards are optional retrieval patches inside opendocu search. Search results remain raw official doc evidence.
The CLI is deterministic. Agents choose keywords, fetch docs, and write Markdown files.`;
}
