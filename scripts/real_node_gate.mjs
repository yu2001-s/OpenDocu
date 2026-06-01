#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const WORK = path.join(ROOT, ".tmp", "real-node-gate");
const REPO = path.join(WORK, "node-v24.16.0");
const STORE = path.join(WORK, "store");
const TAG = "v24.16.0";
const VERSION = "24.16.0";
const COMMIT = "c7d10158bc31036de6783d66beaaaf551e3167aa";
const DOCS = path.join(REPO, "doc", "api");
const URL_BASE = `https://github.com/nodejs/node/blob/${TAG}/doc/api`;

const CASES = [
  {
    name: "async context snapshot",
    args: ["node", "AsyncLocalStorage.snapshot", "context"],
    expectedDoc: "node@24.16.0/async_context",
    expectedHeading: /AsyncLocalStorage\.snapshot/,
  },
  {
    name: "diagnostics tracing subscribers",
    args: ["node", "diagnostics_channel", "tracingChannel", "hasSubscribers"],
    expectedDoc: "node@24.16.0/diagnostics_channel",
    expectedHeading: /tracingChannel\.hasSubscribers/,
  },
  {
    name: "stream compose duplex",
    args: ["node", "stream", "compose", "Duplex"],
    expectedDoc: "node@24.16.0/stream",
    expectedHeading: /stream\.compose/,
  },
  {
    name: "abort timeout signal",
    args: ["node", "AbortSignal", "timeout", "signal"],
    expectedDoc: "node@24.16.0/globals",
    expectedHeading: /AbortSignal\.timeout/,
  },
];

async function main() {
  await fs.mkdir(WORK, { recursive: true });

  if (!(await exists(REPO))) {
    run("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      TAG,
      "--filter=blob:none",
      "--sparse",
      "https://github.com/nodejs/node.git",
      REPO,
    ]);
    run("git", ["-C", REPO, "sparse-checkout", "set", "doc/api"]);
  }

  const actualCommit = run("git", ["-C", REPO, "rev-parse", "HEAD"]).stdout.trim();
  if (actualCommit !== COMMIT) {
    throw new Error(`unexpected Node docs commit: ${actualCommit}`);
  }

  await fs.rm(STORE, { recursive: true, force: true });
  runOpenDocu(["import", "node", VERSION, DOCS, "--url-base", URL_BASE]);
  runOpenDocu(["index"]);
  const doctor = runOpenDocu(["doctor"]).stdout;

  const results = [];
  for (const testCase of CASES) {
    const output = runOpenDocu([
      "search",
      ...testCase.args,
      "--version",
      VERSION,
      "--limit",
      "1",
      "--json",
    ]).stdout;
    const payload = JSON.parse(output);
    const top = payload.results[0];
    if (!top) {
      throw new Error(`${testCase.name}: no results`);
    }
    if (top.doc_id !== testCase.expectedDoc) {
      throw new Error(`${testCase.name}: expected ${testCase.expectedDoc}, got ${top.doc_id}`);
    }
    if (!testCase.expectedHeading.test(top.heading)) {
      throw new Error(`${testCase.name}: unexpected heading ${top.heading}`);
    }
    results.push({
      name: testCase.name,
      doc_id: top.doc_id,
      heading: top.heading,
      url: top.url,
      count: payload.count,
    });
  }

  const rg = run(
    "rg",
    [
      "-n",
      "AsyncLocalStorage.snapshot|context",
      path.join(STORE, "libraries", "node", "versions", VERSION, "pages"),
    ],
    { allowFailure: true },
  );
  const rgLines = rg.status === 0 ? rg.stdout.trim().split("\n").filter(Boolean).length : null;

  console.log(
    JSON.stringify(
      {
        corpus: {
          source: "https://github.com/nodejs/node",
          tag: TAG,
          commit: COMMIT,
          docs_dir: "doc/api",
        },
        doctor,
        cases: results,
        raw_rg_line_hits_for_async_context_query: rgLines,
      },
      null,
      2,
    ),
  );
}

function runOpenDocu(args) {
  return run("node", [path.join(ROOT, "bin", "opendocu.mjs"), ...args], {
    env: { ...process.env, OPENDOCU_HOME: STORE },
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: options.env || process.env,
    encoding: "utf8",
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
