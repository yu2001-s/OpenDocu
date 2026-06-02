#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_RUN_DIR = path.join(ROOT, ".tmp", "live-agent-eval", timestamp());
const CLI = path.join(ROOT, "bin", "opendocu.mjs");

const SCENARIOS = [
  {
    id: "node-24",
    library: "node",
    version: "24.16.0",
    docsProfile: "excellent versioned Markdown API docs",
    minDocs: 40,
    officialSourcePatterns: ["nodejs.org", "github.com/nodejs/node"],
    sourceBrief:
      "Use official Node.js v24.16.0 API documentation, such as the Node.js release docs or the nodejs/node repository at tag v24.16.0.",
    queries: [
      {
        id: "async-snapshot",
        kind: "easy-api",
        question: "In Node.js 24.16.0, what does AsyncLocalStorage.snapshot() do?",
        expectedTerms: ["AsyncLocalStorage.snapshot", "captures", "context"],
      },
      {
        id: "diagnostics-subscribers",
        kind: "niche-symbol",
        question:
          "In Node.js 24.16.0, what does diagnostics_channel tracingChannel.hasSubscribers tell me?",
        expectedTerms: ["tracingChannel.hasSubscribers", "subscriber"],
      },
      {
        id: "test-watch",
        kind: "option-keyword",
        question: "In Node.js 24.16.0, what does node --test --watch do?",
        expectedTerms: ["--watch", "watch"],
      },
      {
        id: "abort-timeout",
        kind: "version-specific",
        question:
          "In Node.js 24.16.0, what does AbortSignal.timeout(delay) return and when does it abort?",
        expectedTerms: ["AbortSignal.timeout", "AbortSignal", "delay"],
      },
      {
        id: "negative-bun-serve",
        kind: "negative",
        question:
          "Does this local Node.js 24.16.0 store document Bun.serve routing options?",
        negative: true,
        forbiddenTerms: ["Bun.serve routing options are documented"],
      },
    ],
  },
  {
    id: "react-19",
    library: "react",
    version: "19",
    docsProfile: "excellent web framework docs with changed concepts",
    minDocs: 12,
    officialSourcePatterns: ["react.dev"],
    sourceBrief:
      "Use official React 19 documentation from react.dev, preserving reference and upgrade material broadly enough for API and version-specific questions.",
    queries: [
      {
        id: "transition-actions",
        kind: "changed-concept",
        question: "In React 19, what are Actions inside transitions?",
        expectedTerms: ["Actions", "startTransition"],
      },
      {
        id: "use-action-state",
        kind: "api",
        question: "In React 19, what does useActionState return?",
        expectedTerms: ["useActionState", "pending"],
      },
      {
        id: "ref-as-prop",
        kind: "version-specific",
        question: "In React 19, can function components receive ref as a prop?",
        expectedTerms: ["ref", "prop"],
      },
      {
        id: "use-optimistic",
        kind: "api",
        question: "What is React 19 useOptimistic for?",
        expectedTerms: ["useOptimistic", "optimistic"],
      },
      {
        id: "negative-server-side-state",
        kind: "negative",
        question: "Does React 19 document a hook named useServerSideState?",
        negative: true,
        forbiddenTerms: ["useServerSideState is documented"],
      },
    ],
  },
  {
    id: "nextjs-15",
    library: "nextjs",
    version: "15.3.2",
    docsProfile: "version-sensitive framework docs",
    minDocs: 15,
    officialSourcePatterns: ["nextjs.org/docs", "github.com/vercel/next.js"],
    sourceBrief:
      "Use official Next.js 15 documentation. Preserve enough pages to answer routing, middleware, metadata, caching, and version-boundary questions.",
    queries: [
      {
        id: "middleware-cookies",
        kind: "common-workflow",
        question:
          "In Next.js 15.3.2, how do middleware cookies work with NextRequest and NextResponse?",
        expectedTerms: ["middleware", "cookies", "NextResponse"],
      },
      {
        id: "generate-metadata-parent",
        kind: "cross-page-concept",
        question:
          "In Next.js 15, how can generateMetadata use parent metadata?",
        expectedTerms: ["generateMetadata", "parent"],
      },
      {
        id: "dynamic-params",
        kind: "option-property",
        question: "What does dynamicParams control in a Next.js 15 route segment config?",
        expectedTerms: ["dynamicParams", "route segment"],
      },
      {
        id: "revalidate-tag",
        kind: "niche-api",
        question: "In Next.js 15, what is revalidateTag used for?",
        expectedTerms: ["revalidateTag", "cache"],
      },
      {
        id: "negative-cache-components",
        kind: "negative-version-boundary",
        question:
          "Does a Next.js 15.3.2 docs store provide evidence for cacheComponents?",
        negative: true,
        forbiddenTerms: ["cacheComponents is documented for 15.3.2"],
      },
    ],
  },
  {
    id: "python-313",
    library: "python",
    version: "3.13",
    docsProfile: "large official HTML standard-library docs",
    minDocs: 20,
    officialSourcePatterns: ["docs.python.org/3.13"],
    sourceBrief:
      "Use official Python 3.13 documentation from docs.python.org. Preserve standard-library pages broadly enough for asyncio, queue, copy, and tomllib questions.",
    queries: [
      {
        id: "taskgroup-cancellation",
        kind: "cross-page-concept",
        question:
          "In Python 3.13, how does asyncio.TaskGroup create_task relate to cancellation?",
        expectedTerms: ["TaskGroup", "create_task", "cancellation"],
      },
      {
        id: "queue-shutdown",
        kind: "version-specific",
        question: "In Python 3.13, what does queue.Queue.shutdown do?",
        expectedTerms: ["Queue.shutdown", "shutdown"],
      },
      {
        id: "copy-replace",
        kind: "version-specific",
        question: "In Python 3.13, what is copy.replace for?",
        expectedTerms: ["copy.replace", "replace"],
      },
      {
        id: "argparse-deprecated",
        kind: "niche-option",
        question:
          "In Python 3.13 argparse, what does the deprecated argument on add_parser do?",
        expectedTerms: ["deprecated", "add_parser"],
      },
      {
        id: "negative-tomllib-dump",
        kind: "negative",
        question: "Does Python 3.13 tomllib document a dump function for writing TOML?",
        negative: true,
        forbiddenTerms: ["tomllib.dump is documented"],
      },
    ],
  },
  {
    id: "p-map-7",
    library: "p-map",
    version: "7",
    docsProfile: "README-centric package docs",
    minDocs: 1,
    officialSourcePatterns: ["github.com/sindresorhus/p-map", "npmjs.com/package/p-map"],
    sourceBrief:
      "Use official p-map package documentation, such as the sindresorhus/p-map README and package docs for version 7. Preserve the README/API material rather than writing a tiny custom answer page.",
    queries: [
      {
        id: "concurrency",
        kind: "api-option",
        question: "In p-map 7, what does the concurrency option control?",
        expectedTerms: ["concurrency"],
      },
      {
        id: "stop-on-error",
        kind: "niche-option",
        question: "In p-map 7, what changes when stopOnError is false?",
        expectedTerms: ["stopOnError", "AggregateError"],
      },
      {
        id: "p-map-skip",
        kind: "symbol",
        question: "What is pMapSkip used for in p-map 7?",
        expectedTerms: ["pMapSkip", "skip"],
      },
      {
        id: "iterable-backpressure",
        kind: "niche-symbol",
        question: "What does pMapIterable backpressure control in p-map 7?",
        expectedTerms: ["pMapIterable", "backpressure"],
      },
      {
        id: "negative-ttl-cache",
        kind: "negative",
        question: "Does p-map 7 document TTL cache eviction?",
        negative: true,
        forbiddenTerms: ["TTL cache eviction is documented"],
      },
    ],
  },
];

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "plan") {
    const flags = parseFlags(rest);
    const runDir = path.resolve(flags.runDir || DEFAULT_RUN_DIR);
    await writePlan(runDir);
    console.log(`Live-agent eval plan written to ${runDir}`);
    console.log(`Next: spawn agents with prompts under ${path.join(runDir, "prompts")}`);
    console.log(`Score after reports are written: node scripts/live_agent_eval.mjs score ${runDir}`);
    return;
  }

  if (command === "score") {
    const runDirArg = rest.find((arg) => !arg.startsWith("--"));
    if (!runDirArg) {
      throw new Error("usage: live_agent_eval.mjs score <run-dir> [--json]");
    }
    const flags = parseFlags(rest.filter((arg) => arg !== runDirArg));
    const report = await scoreRun(path.resolve(runDirArg));
    if (flags.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printScore(report);
    }
    if (report.status !== "pass") {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

async function writePlan(runDir) {
  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(path.join(runDir, "evaluator", "answer-keys"), { recursive: true });
  await fs.mkdir(path.join(runDir, "prompts"), { recursive: true });
  await fs.mkdir(path.join(runDir, "reports"), { recursive: true });
  await fs.mkdir(path.join(runDir, "stores"), { recursive: true });

  const manifest = {
    schema_version: 1,
    eval: "opendocu-live-agent-eval",
    created_at: new Date().toISOString(),
    root: ROOT,
    rules: [
      "Grower agents must not see query prompts or answer keys.",
      "Query agents must not see answer keys.",
      "All imported docs must come from official sources.",
      "Raw docs are the knowledge base.",
      "Semantic cards are optional retrieval patches; final answers must use raw docs.",
    ],
    scenarios: SCENARIOS.map((scenario) => ({
      id: scenario.id,
      library: scenario.library,
      version: scenario.version,
      docs_profile: scenario.docsProfile,
      store: storePath(runDir, scenario.id),
      grower_prompt: path.join("prompts", scenario.id, "grower.md"),
      query_prompts: scenario.queries.map((query) =>
        path.join("prompts", scenario.id, "queries", `${query.id}.md`),
      ),
      grower_report: path.join("reports", scenario.id, "grower.json"),
      query_reports: scenario.queries.map((query) =>
        path.join("reports", scenario.id, `${query.id}.json`),
      ),
    })),
  };

  await fs.writeFile(path.join(runDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(runDir, "README.md"), runReadme(runDir));

  for (const scenario of SCENARIOS) {
    const promptDir = path.join(runDir, "prompts", scenario.id);
    const queryDir = path.join(promptDir, "queries");
    await fs.mkdir(queryDir, { recursive: true });
    await fs.mkdir(path.join(runDir, "reports", scenario.id), { recursive: true });
    await fs.mkdir(storePath(runDir, scenario.id), { recursive: true });

    await fs.writeFile(
      path.join(promptDir, "grower.md"),
      growerPrompt(runDir, scenario),
    );
    for (const query of scenario.queries) {
      await fs.writeFile(
        path.join(queryDir, `${query.id}.md`),
        queryPrompt(runDir, scenario, query),
      );
    }
    await fs.writeFile(
      path.join(runDir, "evaluator", "answer-keys", `${scenario.id}.json`),
      `${JSON.stringify(answerKey(scenario), null, 2)}\n`,
    );
  }
}

function growerPrompt(runDir, scenario) {
  const reportPath = path.join(runDir, "reports", scenario.id, "grower.json");
  return `# OpenDocu Live Eval Grower

You are the grower agent for eval set \`${scenario.id}\`.

You are not alone in the repository. Do not revert or edit repository source files. Write only to this eval store and report path:

- Store: \`${storePath(runDir, scenario.id)}\`
- Report: \`${reportPath}\`

## Task

Grow an OpenDocu knowledgebase for:

- Library: \`${scenario.library}\`
- Version: \`${scenario.version}\`
- Docs profile: ${scenario.docsProfile}

Official-source guidance: ${scenario.sourceBrief}

Do not ask for or inspect query prompts or answer keys. Build a broad, coherent official-doc corpus, not pages targeted to any hidden question.

## Required Flow

1. Fetch or locate official docs using normal shell/browser tools.
2. Import Markdown/MDX with \`opendocu import\` or HTML with \`opendocu import-html\`.
3. Preserve source URLs with \`--url-base\` or source frontmatter.
4. Run \`opendocu index --store ${storePath(runDir, scenario.id)}\`.
5. Run \`opendocu doctor --store ${storePath(runDir, scenario.id)}\`.
6. Treat raw official docs as the knowledge base. Create semantic map cards only as optional retrieval patches for obvious alias/topic gaps; do not try to build a complete graph. If you create cards, run \`opendocu map validate\` and \`opendocu index\` again.

## Report

Write JSON to \`${reportPath}\`:

\`\`\`json
{
  "scenario_id": "${scenario.id}",
  "library": "${scenario.library}",
  "version": "${scenario.version}",
  "store": "${storePath(runDir, scenario.id)}",
  "commands": ["..."],
  "official_sources": ["https://..."],
  "imported_docs": 0,
  "index_ran": true,
  "doctor_ready": true,
  "semantic_cards_created": 0,
  "semantic_map_validated": false,
  "issues": []
}
\`\`\`
`;
}

function queryPrompt(runDir, scenario, query) {
  const reportPath = path.join(runDir, "reports", scenario.id, `${query.id}.json`);
  return `# OpenDocu Live Eval Query

You are an independent query agent for eval set \`${scenario.id}\`.

You are not alone in the repository. Do not revert or edit repository source files. Do not fetch web docs for this query. Do not inspect answer keys.

- Store: \`${storePath(runDir, scenario.id)}\`
- Library: \`${scenario.library}\`
- Version: \`${scenario.version}\`
- Report: \`${reportPath}\`

## User Question

${query.question}

## Rules

1. Use only OpenDocu local retrieval for the answer.
2. Do not pass the full natural-language question to \`opendocu search\`; choose keywords, symbols, options, headings, or error codes.
3. Pass the explicit version whenever possible.
4. Use \`opendocu get\` before answering when search finds relevant evidence.
5. If local evidence is missing, say that the local OpenDocu store does not provide evidence. Do not answer from memory.
6. Final answer evidence must come from raw official docs, not semantic-card text.
7. Do not treat semantic-card count or graph coverage as success. Correct raw-doc retrieval is enough.

For negative questions, set \`no_evidence\` to \`true\` only when local search finds no relevant evidence. If local raw docs explicitly show the feature is absent or unsupported, set \`no_evidence\` to \`false\`, cite those docs, and answer from that contrary evidence.

## Report

Write JSON to \`${reportPath}\`:

\`\`\`json
{
  "scenario_id": "${scenario.id}",
  "query_id": "${query.id}",
  "library": "${scenario.library}",
  "version": "${scenario.version}",
  "question": ${JSON.stringify(query.question)},
  "commands": ["..."],
  "search_terms": ["..."],
  "top_results": [
    {
      "doc_id": "...",
      "heading": "...",
      "url": "..."
    }
  ],
  "used_get": true,
  "no_evidence": false,
  "answer": "...",
  "cited_urls": ["https://..."],
  "issues": []
}
\`\`\`
`;
}

function answerKey(scenario) {
  return {
    scenario_id: scenario.id,
    library: scenario.library,
    version: scenario.version,
    min_docs: scenario.minDocs,
    official_source_patterns: scenario.officialSourcePatterns,
    queries: scenario.queries.map((query) => ({
      id: query.id,
      kind: query.kind,
      question: query.question,
      negative: Boolean(query.negative),
      expected_terms: query.expectedTerms || [],
      forbidden_terms: query.forbiddenTerms || [],
    })),
  };
}

function runReadme(runDir) {
  return `# OpenDocu Live-Agent Eval Run

This run is a manual live-agent evaluation. It is intentionally separate from deterministic CI gates.

## Order

1. Spawn one grower agent per scenario using \`prompts/<scenario>/grower.md\`.
2. Do not show query prompts or \`evaluator/answer-keys\` to grower agents.
3. After each grower finishes, spawn independent query agents using \`prompts/<scenario>/queries/*.md\`.
4. Ask every agent to write its JSON report under \`reports/<scenario>/\`.
5. Score the run:

\`\`\`bash
node scripts/live_agent_eval.mjs score ${runDir}
\`\`\`

The scorer checks transcript/report mechanics. A human should still review wrong-source imports, answer nuance, whether any semantic cards are justified retrieval patches, and cases where an agent got the right answer by luck.
`;
}

async function scoreRun(runDir) {
  const manifest = await readJson(path.join(runDir, "manifest.json"));
  const results = [];
  const checks = [];

  for (const scenarioRef of manifest.scenarios || []) {
    const key = await readJson(path.join(runDir, "evaluator", "answer-keys", `${scenarioRef.id}.json`));
    const scenarioChecks = [];
    const growerPath = path.join(runDir, scenarioRef.grower_report);
    const grower = await readJsonIfExists(growerPath);
    if (!grower) {
      scenarioChecks.push(check(`${scenarioRef.id}:grower-report`, false, `missing ${growerPath}`));
    } else {
      scoreGrower({ runDir, scenarioRef, key, grower, checks: scenarioChecks });
    }

    const queryResults = [];
    for (const query of key.queries) {
      const reportPath = path.join(runDir, "reports", scenarioRef.id, `${query.id}.json`);
      const report = await readJsonIfExists(reportPath);
      const queryChecks = [];
      if (!report) {
        queryChecks.push(check(`${scenarioRef.id}:${query.id}:report`, false, `missing ${reportPath}`));
      } else {
        scoreQuery({ scenarioRef, key, query, report, checks: queryChecks });
      }
      queryResults.push({
        id: query.id,
        status: queryChecks.every((item) => item.pass) ? "pass" : "fail",
        checks: queryChecks,
      });
      scenarioChecks.push(...queryChecks);
    }

    checks.push(...scenarioChecks);
    results.push({
      id: scenarioRef.id,
      status: scenarioChecks.every((item) => item.pass) ? "pass" : "fail",
      checks: scenarioChecks,
      queries: queryResults,
    });
  }

  const failures = checks.filter((item) => !item.pass);
  return {
    schema_version: 1,
    eval: "opendocu-live-agent-eval",
    run_dir: runDir,
    status: failures.length === 0 ? "pass" : "fail",
    summary: {
      score: checks.length - failures.length,
      max_score: checks.length,
      failures: failures.length,
    },
    scenarios: results,
    failures,
  };
}

function scoreGrower({ runDir, scenarioRef, key, grower, checks }) {
  const officialPatterns = officialSourcePatternsFor(key);
  checks.push(
    check(
      `${scenarioRef.id}:grower-official-sources`,
      arrayIncludesPattern(grower.official_sources, officialPatterns),
      `official sources should match one of ${officialPatterns.join(", ")}`,
    ),
  );
  checks.push(
    check(
      `${scenarioRef.id}:grower-index-ran`,
      grower.index_ran === true || commandsInclude(grower.commands, "opendocu index"),
      "grower should run opendocu index",
    ),
  );
  checks.push(
    check(
      `${scenarioRef.id}:grower-doctor-ready`,
      grower.doctor_ready === true || doctorReady(storePath(runDir, scenarioRef.id)),
      "opendocu doctor should report ready",
    ),
  );
  const docCount = Number(grower.imported_docs || 0);
  checks.push(
    check(
      `${scenarioRef.id}:grower-doc-breadth`,
      docCount >= key.min_docs || countStorePages(storePath(runDir, scenarioRef.id)) >= key.min_docs,
      `expected at least ${key.min_docs} imported docs or pages`,
    ),
  );
}

function scoreQuery({ scenarioRef, key, query, report, checks }) {
  const officialPatterns = officialSourcePatternsFor(key);
  const commands = report.commands || [];
  const searchTerms = report.search_terms || [];
  const answer = String(report.answer || "");
  const citedUrls = report.cited_urls || [];
  const topUrls = (report.top_results || []).map((result) => result.url).filter(Boolean);
  const evidenceUrls = [...citedUrls, ...topUrls];

  checks.push(
    check(
      `${scenarioRef.id}:${query.id}:search-used`,
      commandsInclude(commands, "opendocu search") || searchTerms.length > 0,
      "query agent should use opendocu search",
    ),
  );
  checks.push(
    check(
      `${scenarioRef.id}:${query.id}:version-used`,
      String(report.version || "") === key.version || commands.some((command) => String(command).includes(`--version ${key.version}`)),
      `query agent should use version ${key.version}`,
    ),
  );
  checks.push(
    check(
      `${scenarioRef.id}:${query.id}:not-full-question-search`,
      !searchTerms.map(normalize).includes(normalize(query.question)),
      "query agent should not pass the full question as a search term",
    ),
  );

  if (query.negative) {
    checks.push(
      check(
        `${scenarioRef.id}:${query.id}:negative-no-evidence`,
        report.no_evidence === true || deniesClaim(answer),
        "negative query should report no local evidence or answer from local contrary evidence",
      ),
    );
    for (const term of query.forbidden_terms || []) {
      checks.push(
        check(
          `${scenarioRef.id}:${query.id}:negative-forbidden-${safeName(term)}`,
          !answer.toLowerCase().includes(term.toLowerCase()),
          `answer should not claim ${term}`,
        ),
      );
    }
    return;
  }

  checks.push(
    check(
      `${scenarioRef.id}:${query.id}:get-used`,
      report.used_get === true || commandsInclude(commands, "opendocu get"),
      "positive query should use opendocu get before answering",
    ),
  );
  checks.push(
    check(
      `${scenarioRef.id}:${query.id}:official-url`,
      arrayIncludesPattern(evidenceUrls, officialPatterns),
      `evidence URL should match one of ${officialPatterns.join(", ")}`,
    ),
  );
  for (const term of query.expected_terms || []) {
    checks.push(
      check(
        `${scenarioRef.id}:${query.id}:answer-term-${safeName(term)}`,
        answer.toLowerCase().includes(term.toLowerCase()),
        `answer should include evidence term ${term}`,
      ),
    );
  }
}

function printScore(report) {
  console.log(`Live-agent eval: ${report.status}`);
  console.log(`Score: ${report.summary.score}/${report.summary.max_score}`);
  if (report.failures.length > 0) {
    console.log("Failures:");
    for (const failure of report.failures) {
      console.log(`- ${failure.id}: ${failure.message}`);
    }
  }
}

function officialSourcePatternsFor(key) {
  const patterns = new Set(key.official_source_patterns || []);
  if (key.library === "nextjs") {
    patterns.add("github.com/vercel/next.js");
  }
  return [...patterns];
}

function deniesClaim(answer) {
  const normalized = normalize(answer);
  return [
    "no.",
    "does not",
    "do not",
    "not document",
    "not documented",
    "no local",
    "no evidence",
    "doesn't",
    "not support",
    "no dump",
  ].some((phrase) => normalized.includes(phrase));
}

function check(id, pass, message) {
  return { id, pass: Boolean(pass), message };
}

function commandsInclude(commands, needle) {
  return (commands || []).some((command) => String(command).includes(needle));
}

function arrayIncludesPattern(values, patterns) {
  return (values || []).some((value) =>
    (patterns || []).some((pattern) => String(value).includes(pattern)),
  );
}

function doctorReady(store) {
  const result = spawnSync("node", [CLI, "doctor", "--store", store], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return result.status === 0 && /Status: ready/.test(result.stdout);
}

function countStorePages(store) {
  const result = spawnSync("find", [path.join(store, "libraries"), "-type", "f", "-path", "*/pages/*"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return 0;
  }
  return result.stdout.split(/\r?\n/).filter(Boolean).length;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key === "json") {
      flags.json = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    flags[key] = value;
    index += 1;
  }
  return flags;
}

function storePath(runDir, scenarioId) {
  return path.join(runDir, "stores", scenarioId);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalize(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function safeName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function printHelp() {
  console.log(`OpenDocu live-agent eval

Usage:
  node scripts/live_agent_eval.mjs plan [--run-dir <path>]
  node scripts/live_agent_eval.mjs score <run-dir> [--json]

This creates a manual 5-set blind live-agent evaluation. It is not a deterministic CI gate.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
