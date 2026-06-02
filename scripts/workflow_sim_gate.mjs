#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const WORK = path.resolve(
  process.env.OPENDOCU_WORKFLOW_SIM_WORK ||
    process.env.OPENDOCU_AGENT_SIM_WORK ||
    path.join(ROOT, ".tmp", "workflow-sim-gate"),
);
const SOURCES = path.join(WORK, "official-sources");
const STORE = path.join(WORK, "store");
const CLI = path.join(ROOT, "bin", "opendocu.mjs");
const VERSION = "24.16.0";
const URL_BASE = "https://github.com/nodejs/node/blob/v24.16.0/doc/api";
const REPAIR_FAILED_SEARCH_ARGS = [
  "search",
  "node",
  "resume",
  "saved",
  "scope",
  "--version",
  VERSION,
  "--match",
  "all",
  "--limit",
  "1",
  "--json",
];

const SOURCE_DOCS = [
  {
    file: "async_context.md",
    title: "Asynchronous context tracking",
    body: `# Asynchronous context tracking

## Static method: AsyncLocalStorage.snapshot()

\`AsyncLocalStorage.snapshot()\` captures the current execution context and returns a function that calls another function inside that captured context.

## AsyncLocalStorage.run(store, callback[, ...args])

\`AsyncLocalStorage.run()\` runs a function synchronously within a context and returns the callback result.
`,
  },
  {
    file: "test.md",
    title: "Test runner",
    body: `# Test runner

## Watch mode

The Node.js test runner supports running in watch mode by passing the \`--watch\` flag.

\`\`\`bash
node --test --watch
\`\`\`
`,
  },
  {
    file: "cli.md",
    title: "Command-line options",
    body: `# Command-line options

## --version

The \`--version\` command-line option prints the Node.js version and exits.
`,
  },
];

const QUERY_AGENTS = [
  {
    id: "easy-api-agent",
    userQuestion: "What does AsyncLocalStorage.snapshot() do in Node 24.16.0?",
    searchArgs: ["search", "node", "AsyncLocalStorage.snapshot", "context", "--version", VERSION, "--limit", "1", "--json"],
    expectedTopDoc: "node@24.16.0/async_context",
    evidence: ["captures the current execution context", "captured context"],
  },
  {
    id: "option-keyword-agent",
    userQuestion: "In Node 24.16.0 tests, what does --watch do?",
    searchArgs: ["search", "node", "--watch", "--version", VERSION, "--limit", "1", "--json"],
    expectedTopDoc: "node@24.16.0/test",
    evidence: ["watch mode", "--watch"],
  },
  {
    id: "known-flag-agent",
    userQuestion: "For Node 24.16.0, what does the --version command-line option print?",
    searchArgs: ["search", "node", "--version", VERSION, "--limit", "1", "--json", "--", "--version"],
    expectedTopDoc: "node@24.16.0/cli",
    evidence: ["prints the Node.js version", "exits"],
  },
  {
    id: "retrieval-repair-agent",
    userQuestion: "How can I resume a saved async scope in Node 24.16.0?",
    searchArgs: REPAIR_FAILED_SEARCH_ARGS,
    expectedTopDoc: "node@24.16.0/async_context",
    expectedSemanticCard: "apis/asynclocalstorage-snapshot.md",
    evidence: ["captured context", "calls another function"],
  },
  {
    id: "no-evidence-agent",
    userQuestion: "Does this local Node 24.16.0 store document AbortSignal.timeout()?",
    searchArgs: ["search", "node", "AbortSignal.timeout", "signal", "--version", VERSION, "--limit", "1", "--json"],
    expectNoResults: true,
  },
];

const checks = [];

async function main() {
  await fs.rm(WORK, { recursive: true, force: true });
  await fs.mkdir(SOURCES, { recursive: true });

  await writeOfficialSourceTree();
  const grower = await runGrowerAgent();
  const queryAgents = QUERY_AGENTS.map(runQueryAgent);
  const failures = checks.filter((check) => !check.pass);

  const report = {
    schema_version: 1,
    gate: "opendocu-workflow-sim-gate",
    mode: "deterministic scripted CLI workflow simulation",
    status: failures.length === 0 ? "pass" : "fail",
    summary: {
      score: checks.length - failures.length,
      max_score: checks.length,
      threshold: checks.length,
    },
    store: STORE,
    official_source: {
      url_base: URL_BASE,
      files: SOURCE_DOCS.map((doc) => doc.file),
    },
    scripted_grower: grower,
    scripted_query_personas: queryAgents,
    checks,
  };

  console.log(JSON.stringify(report, null, 2));

  if (failures.length > 0) {
    console.error(
      `OpenDocu workflow simulation gate failed:\n${failures
        .map((failure) => `- ${failure.id}: ${failure.message}`)
        .join("\n")}`,
    );
    process.exitCode = 1;
  }
}

async function writeOfficialSourceTree() {
  for (const doc of SOURCE_DOCS) {
    const fullPath = path.join(SOURCES, doc.file);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(
      fullPath,
      `---
title: ${JSON.stringify(doc.title)}
---

${doc.body}`,
    );
  }
}

async function runGrowerAgent() {
  const transcript = [];
  transcript.push(runOpenDocu(["init"]));
  transcript.push(runOpenDocu(["import", "node", VERSION, SOURCES, "--url-base", URL_BASE]));
  transcript.push(runOpenDocu(["index"]));
  const initialDoctor = runOpenDocu(["doctor"]);
  transcript.push(initialDoctor);

  const initialMiss = runOpenDocu(REPAIR_FAILED_SEARCH_ARGS);
  transcript.push(initialMiss);
  const initialMissPayload = JSON.parse(initialMiss.stdout);
  addCheck(
    "repair-initial-search-miss",
    initialMissPayload.results.length === 0,
    `expected alias query to miss before card, got ${initialMissPayload.results[0]?.doc_id || "none"}`,
  );

  const evidenceSearch = runOpenDocu([
    "search",
    "node",
    "AsyncLocalStorage.snapshot",
    "context",
    "--version",
    VERSION,
    "--limit",
    "1",
    "--json",
  ]);
  transcript.push(evidenceSearch);
  const evidencePayload = JSON.parse(evidenceSearch.stdout);
  const evidenceDocId = evidencePayload.results[0]?.doc_id;
  addCheck("repair-found-raw-doc", evidenceDocId === `node@${VERSION}/async_context`, `expected raw doc, got ${evidenceDocId || "none"}`);

  if (evidenceDocId) {
    const evidencePage = runOpenDocu(["get", evidenceDocId]);
    transcript.push(evidencePage);
    addCheck(
      "repair-confirmed-with-get",
      /captures the current execution context/.test(evidencePage.stdout),
      "raw doc should contain the answer before card creation",
    );
  }

  transcript.push(runOpenDocu(["map", "init", "node", VERSION]));

  const sourceDocPath = path.join(STORE, "libraries", "node", "versions", VERSION, "pages", "async_context.md");
  const rawDoc = await fs.readFile(sourceDocPath, "utf8");
  const sourceHash = frontmatterValue(rawDoc, "content_hash");
  const semanticCardPath = path.join(
    STORE,
    "libraries",
    "node",
    "versions",
    VERSION,
    "map",
    "apis",
    "asynclocalstorage-snapshot.md",
  );
  await fs.mkdir(path.dirname(semanticCardPath), { recursive: true });
  await fs.writeFile(
    semanticCardPath,
    `---
library: "node"
version: "${VERSION}"
title: "AsyncLocalStorage snapshot"
kind: "api"
sources: "node@${VERSION}/async_context"
source_hashes: "${sourceHash}"
aliases: "snapshot, captured context, re-enter captured context, resume saved scope, saved async scope"
topics: "async context, context propagation"
edges: "node@${VERSION}/async_context#AsyncLocalStorage.run|related_api|context_only"
---

# AsyncLocalStorage snapshot

Retrieval patch for user wording around resuming a saved async scope. Answers still come from the raw official async context page.
`,
  );

  transcript.push({
    command: "write semantic card",
    file: path.relative(ROOT, semanticCardPath),
    status: 0,
  });

  const mapValidation = JSON.parse(runOpenDocu(["map", "validate", "node", "--version", VERSION, "--json"]).stdout);
  transcript.push({ command: "opendocu map validate node --version 24.16.0 --json", status: 0 });
  addCheck("grower-map-validation-pass", mapValidation.status === "pass", mapValidation.errors.join(", ") || "semantic map validation passed");
  const source = mapValidation.cards.find((card) => card.file === "apis/asynclocalstorage-snapshot.md")?.sources[0];
  addCheck("grower-map-source-hash-ok", source?.hash_ok === true, "semantic card source hash validates");

  transcript.push(runOpenDocu(["index"]));
  const doctor = runOpenDocu(["doctor"]);
  transcript.push(doctor);
  const repairReplay = runOpenDocu(REPAIR_FAILED_SEARCH_ARGS);
  transcript.push(repairReplay);
  const repairPayload = JSON.parse(repairReplay.stdout);
  addCheck(
    "repair-replay-routes-raw-doc",
    repairPayload.results[0]?.doc_id === `node@${VERSION}/async_context`,
    `expected repaired search to return raw doc, got ${repairPayload.results[0]?.doc_id || "none"}`,
  );
  addCheck(
    "repair-replay-has-card",
    repairPayload.results[0]?.semantic_matches?.[0]?.file === "apis/asynclocalstorage-snapshot.md",
    `expected semantic routing hint, got ${repairPayload.results[0]?.semantic_matches?.[0]?.file || "none"}`,
  );

  const importedDocs = await walk(path.join(STORE, "libraries", "node", "versions", VERSION, "pages"));
  addCheck("grower-started-empty-and-imported", importedDocs.length === SOURCE_DOCS.length, `imported ${importedDocs.length}/${SOURCE_DOCS.length} docs`);
  addCheck("grower-index-ready", /Status: ready/.test(doctor.stdout), doctor.stdout.trim());
  await checkOfficialUrls(importedDocs);

  return {
    id: "grower-agent",
    role: "start from empty store, import official docs, index, repair one failed retrieval with a source-backed card",
    status: checks.some((check) => /^(grower|repair)-/.test(check.id) && !check.pass) ? "fail" : "pass",
    commands: transcript.map(compactCommand),
    imported_docs: importedDocs.map((file) => path.relative(STORE, file)),
  };
}

function runQueryAgent(agent) {
  const commands = [];
  const search = runOpenDocu(agent.searchArgs);
  commands.push(search);
  const payload = JSON.parse(search.stdout);
  const top = payload.results[0] || null;
  const agentChecks = [];

  agentChecks.push(addCheck(`${agent.id}-did-not-pass-question`, !commandIncludesQuestion(agent), "search used distilled keywords, not the full question"));
  agentChecks.push(addCheck(`${agent.id}-used-version`, agent.searchArgs.includes("--version") && agent.searchArgs.includes(VERSION), "search passed explicit version"));

  if (agent.expectNoResults) {
    agentChecks.push(addCheck(`${agent.id}-no-results`, payload.results.length === 0, `expected no local evidence, got ${top?.doc_id || "none"}`));
    return {
      id: agent.id,
      user_question: agent.userQuestion,
      status: agentChecks.every((check) => check.pass) ? "pass" : "fail",
      commands: commands.map(compactCommand),
      result: { count: payload.results.length },
      answer_policy: "No answer produced because OpenDocu returned no local evidence.",
    };
  }

  agentChecks.push(addCheck(`${agent.id}-has-result`, Boolean(top), "expected OpenDocu evidence"));
  if (top) {
    agentChecks.push(addCheck(`${agent.id}-top-doc`, top.doc_id === agent.expectedTopDoc, `expected ${agent.expectedTopDoc}, got ${top.doc_id}`));
    agentChecks.push(addCheck(`${agent.id}-official-url`, top.url?.startsWith(URL_BASE), `expected official source URL, got ${top.url || "none"}`));
    if (agent.expectedSemanticCard) {
      const matchedCard = top.semantic_matches?.[0]?.file;
      agentChecks.push(addCheck(`${agent.id}-semantic-card`, matchedCard === agent.expectedSemanticCard, `expected ${agent.expectedSemanticCard}, got ${matchedCard || "none"}`));
    }
    const page = runOpenDocu(["get", top.doc_id]);
    commands.push(page);
    const missingEvidence = agent.evidence.filter((term) => !page.stdout.toLowerCase().includes(term.toLowerCase()));
    agentChecks.push(addCheck(`${agent.id}-used-get`, commands.some((command) => command.argv[0] === "get"), "agent read full raw page with opendocu get"));
    agentChecks.push(addCheck(`${agent.id}-answer-evidence`, missingEvidence.length === 0, missingEvidence.length ? `missing ${missingEvidence.join(", ")}` : "raw doc contains answer evidence"));
  }

  return {
    id: agent.id,
    user_question: agent.userQuestion,
    status: agentChecks.every((check) => check.pass) ? "pass" : "fail",
    commands: commands.map(compactCommand),
    result: top
      ? {
          doc_id: top.doc_id,
          heading: top.heading,
          url: top.url,
          semantic_matches: top.semantic_matches || [],
        }
      : null,
  };
}

async function checkOfficialUrls(importedDocs) {
  const badUrls = [];
  for (const file of importedDocs) {
    const content = await fs.readFile(file, "utf8");
    const url = frontmatterValue(content, "url");
    if (!url.startsWith(URL_BASE)) {
      badUrls.push(path.relative(STORE, file));
    }
  }
  addCheck("grower-official-source-urls", badUrls.length === 0, badUrls.join(", ") || "all imported docs use official source URLs");
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
  return {
    command: `opendocu ${args.join(" ")}`,
    argv: args,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function addCheck(id, pass, message) {
  const check = { id, pass: Boolean(pass), message };
  checks.push(check);
  return check;
}

function commandIncludesQuestion(agent) {
  const normalizedQuestion = normalize(agent.userQuestion);
  return agent.searchArgs.some((arg) => normalize(arg) === normalizedQuestion);
}

function normalize(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function frontmatterValue(content, key) {
  const match = new RegExp(`^${key}:\\s*"([^"]+)"`, "m").exec(content);
  return match?.[1] || "";
}

function compactCommand(command) {
  return {
    command: command.command,
    status: command.status,
    stdout: command.stdout ? command.stdout.trim().slice(0, 300) : undefined,
    stderr: command.stderr ? command.stderr.trim().slice(0, 300) : undefined,
    file: command.file,
  };
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
