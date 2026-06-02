#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const WORK = path.resolve(process.env.OPENDOCU_SOURCE_NORMALIZATION_WORK || path.join(ROOT, ".tmp", "source-normalization-gate"));
const OFFICIAL = path.join(WORK, "structured-official-source");
const NORMALIZED = path.join(WORK, "normalized-md");
const STORE = path.join(WORK, "store");
const CLI = path.join(ROOT, "bin", "opendocu.mjs");
const LIBRARY = "widgetkit";
const VERSION = "2.4.0";
const URL_BASE = "https://docs.widgetkit.example/v2.4";
const RETRIEVED_AT = "2026-06-02T00:00:00.000Z";

const STRUCTURED_DOCS = [
  {
    file: "reference/widget.json",
    identifier: "widgetkit.Widget",
    title: "Widget",
    url: `${URL_BASE}/reference/widget`,
    abstract: "Widget is a renderable unit that can be mounted to a host surface.",
    sections: [
      {
        heading: "Method: Widget.render(options)",
        body: "Widget.render(options) renders a widget and returns a RenderHandle. In 2.4.0 the hydration option accepts client, server, or none.",
        signature: "Widget.render(options: RenderOptions): RenderHandle",
        parameters: [
          ["options.hydration", "Controls hydration mode. Accepted values are client, server, and none."],
          ["options.deferMount", "Delays host attachment until the returned RenderHandle.mount() method is called."],
        ],
      },
      {
        heading: "Version Notes",
        body: "The none hydration mode was added in 2.4.0. Earlier 2.x releases only documented client and server.",
      },
    ],
    topics: [
      ["Render lifecycle", "/v2.4/reference/render-lifecycle"],
      ["Hydration guide", "/v2.4/guides/hydration"],
    ],
  },
  {
    file: "reference/cache-store.json",
    identifier: "widgetkit.CacheStore.expireAfter",
    title: "CacheStore.expireAfter",
    url: `${URL_BASE}/reference/cache-store/expire-after`,
    abstract: "CacheStore.expireAfter configures time-based cache invalidation for rendered widget data.",
    sections: [
      {
        heading: "Property: expireAfter",
        body: "Set expireAfter to a duration string such as 30s, 5m, or 2h. A value of null disables automatic expiration.",
        signature: "expireAfter?: DurationString | null",
      },
      {
        heading: "Warnings",
        body: "expireAfter does not evict persisted offline snapshots. Snapshot retention is controlled separately by snapshotRetention.",
      },
    ],
  },
  {
    file: "reference/render-lifecycle.json",
    identifier: "widgetkit.RenderHandle",
    title: "Render lifecycle",
    url: `${URL_BASE}/reference/render-lifecycle`,
    abstract: "RenderHandle tracks a widget render from creation through mount, flush, and disposal.",
    sections: [
      {
        heading: "RenderHandle.flush(signal)",
        body: "RenderHandle.flush(signal) waits for pending render work. If an AbortSignal is aborted before completion, flush rejects with AbortError.",
        signature: "flush(signal?: AbortSignal): Promise<void>",
      },
      {
        heading: "Disposal",
        body: "Calling dispose() releases host resources and prevents future mount() calls on the same handle.",
      },
    ],
  },
];

const checks = [];

async function main() {
  await fs.rm(WORK, { recursive: true, force: true });
  await fs.mkdir(OFFICIAL, { recursive: true });
  await fs.mkdir(NORMALIZED, { recursive: true });

  await writeStructuredOfficialSource();
  const normalizedFiles = await normalizeStructuredSource();
  addCheck("normalizer-wrote-pages", normalizedFiles.length === STRUCTURED_DOCS.length, `normalized ${normalizedFiles.length}/${STRUCTURED_DOCS.length} pages`);

  runOpenDocu(["init"]);
  runOpenDocu(["import", LIBRARY, VERSION, NORMALIZED, "--url-base", URL_BASE]);
  runOpenDocu(["index"]);
  const doctor = runOpenDocu(["doctor"]);
  addCheck("doctor-ready", /Status: ready/.test(doctor.stdout), doctor.stdout.trim());

  const storedFiles = await walk(path.join(STORE, "libraries", LIBRARY, "versions", VERSION, "pages"));
  addCheck("imported-normalized-pages", storedFiles.length === STRUCTURED_DOCS.length, `imported ${storedFiles.length}/${STRUCTURED_DOCS.length} pages`);
  await checkStoredProvenance(storedFiles);
  await checkQueries();

  const failures = checks.filter((check) => !check.pass);
  const report = {
    schema_version: 1,
    gate: "opendocu-source-normalization-gate",
    mode: "structured official-source fixture normalized before import",
    status: failures.length === 0 ? "pass" : "fail",
    summary: {
      score: checks.length - failures.length,
      max_score: checks.length,
      threshold: checks.length,
    },
    official_source: OFFICIAL,
    normalized_source: NORMALIZED,
    store: STORE,
    checks,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) {
    console.error(
      `OpenDocu source normalization gate failed:\n${failures
        .map((failure) => `- ${failure.id}: ${failure.message}`)
        .join("\n")}`,
    );
    process.exitCode = 1;
  }
}

async function writeStructuredOfficialSource() {
  for (const doc of STRUCTURED_DOCS) {
    const destination = path.join(OFFICIAL, doc.file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, JSON.stringify(doc, null, 2));
  }
}

async function normalizeStructuredSource() {
  const written = [];
  for (const doc of STRUCTURED_DOCS) {
    const sourcePath = path.join(OFFICIAL, doc.file);
    const raw = await fs.readFile(sourcePath, "utf8");
    const parsed = JSON.parse(raw);
    const normalizedPath = path.join(NORMALIZED, doc.file.replace(/\.json$/i, ".md"));
    await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
    await fs.writeFile(normalizedPath, structuredDocToMarkdown(parsed, raw));
    written.push(normalizedPath);
  }
  return written;
}

function structuredDocToMarkdown(doc, raw) {
  const contentHash = `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`;
  const lines = [
    "---",
    `library: ${quoteYaml(LIBRARY)}`,
    `version: ${quoteYaml(VERSION)}`,
    `title: ${quoteYaml(doc.title)}`,
    `url: ${quoteYaml(doc.url)}`,
    `retrieved_at: ${quoteYaml(RETRIEVED_AT)}`,
    `content_hash: ${quoteYaml(contentHash)}`,
    `source_format: ${quoteYaml("structured-json")}`,
    `source_adapter: ${quoteYaml("generic-official-doc-normalization")}`,
    `source_identifier: ${quoteYaml(doc.identifier)}`,
    "---",
    "",
    `# ${doc.title}`,
    "",
    `Source: ${doc.url}`,
    `Identifier: ${doc.identifier}`,
    "",
    doc.abstract || "",
  ];

  for (const section of doc.sections || []) {
    lines.push("", `## ${section.heading}`, "", section.body || "");
    if (section.signature) {
      lines.push("", "### Signature", "", "```ts", section.signature, "```");
    }
    if (section.parameters?.length) {
      lines.push("", "### Parameters", "", "| Name | Description |", "| --- | --- |");
      for (const [name, description] of section.parameters) {
        lines.push(`| \`${name}\` | ${description} |`);
      }
    }
  }

  if (doc.topics?.length) {
    lines.push("", "## Related Topics", "");
    for (const [label, href] of doc.topics) {
      const url = href.startsWith("http") ? href : `https://docs.widgetkit.example${href}`;
      lines.push(`- [${label}](${url})`);
    }
  }

  return `${lines.filter((line) => line !== null && line !== undefined).join("\n").trim()}\n`;
}

async function checkStoredProvenance(storedFiles) {
  const missing = [];
  const doubled = [];
  for (const file of storedFiles) {
    const content = await fs.readFile(file, "utf8");
    if (
      !content.includes('source_format: "structured-json"') ||
      !content.includes('source_adapter: "generic-official-doc-normalization"') ||
      !frontmatterValue(content, "url").startsWith(URL_BASE)
    ) {
      missing.push(path.relative(STORE, file));
    }
    if (content.includes("source_source_format") || content.includes("source_source_adapter")) {
      doubled.push(path.relative(STORE, file));
    }
  }
  addCheck("provenance-preserved", missing.length === 0, missing.join(", ") || "source metadata and official URLs preserved");
  addCheck("provenance-not-double-prefixed", doubled.length === 0, doubled.join(", ") || "source_* metadata stayed clean");
}

async function checkQueries() {
  const exact = JSON.parse(
    runOpenDocu([
      "search",
      LIBRARY,
      "Widget.render",
      "hydration",
      "--version",
      VERSION,
      "--limit",
      "1",
      "--json",
    ]).stdout,
  );
  addCheck("exact-symbol-search", exact.results[0]?.doc_id === `${LIBRARY}@${VERSION}/reference/widget`, `expected widget page, got ${exact.results[0]?.doc_id || "none"}`);

  const niche = JSON.parse(
    runOpenDocu([
      "search",
      LIBRARY,
      "deferMount",
      "RenderHandle.mount",
      "--version",
      VERSION,
      "--limit",
      "1",
      "--json",
    ]).stdout,
  );
  addCheck("niche-parameter-search", niche.results[0]?.doc_id === `${LIBRARY}@${VERSION}/reference/widget`, `expected widget page, got ${niche.results[0]?.doc_id || "none"}`);

  const get = runOpenDocu(["get", `${LIBRARY}@${VERSION}/reference/widget`]);
  addCheck(
    "get-preserves-structured-fields",
    get.stdout.includes("| `options.deferMount` |") && get.stdout.includes("none hydration mode was added in 2.4.0"),
    "get should show parameter table and version note",
  );

  const negative = JSON.parse(
    runOpenDocu([
      "search",
      LIBRARY,
      "offline",
      "queue",
      "retries",
      "--version",
      VERSION,
      "--match",
      "all",
      "--limit",
      "1",
      "--json",
    ]).stdout,
  );
  addCheck("negative-no-evidence", negative.results.length === 0, `expected no local evidence, got ${negative.results[0]?.doc_id || "none"}`);
}

function runOpenDocu(args) {
  const result = spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, OPENDOCU_HOME: STORE },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`opendocu ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

function addCheck(id, pass, message) {
  const check = { id, pass: Boolean(pass), message };
  checks.push(check);
  return check;
}

function frontmatterValue(content, key) {
  const match = new RegExp(`^${key}:\\s*"([^"]+)"`, "m").exec(content);
  return match?.[1] || "";
}

async function walk(root) {
  const results = [];
  async function visit(dir) {
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
        await visit(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }
  await visit(root);
  return results.sort();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
