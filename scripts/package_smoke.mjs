#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const WORK = path.join(ROOT, ".tmp", "package-smoke");
const PACK_DIR = path.join(WORK, "pack");
const PREFIX = path.join(WORK, "prefix");
const STORE = path.join(WORK, "store");
const SOURCE = path.join(WORK, "source");
const BUNDLE = path.join(WORK, "plugin-bundle");

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  ".tmp",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  "coverage",
]);

async function main() {
  const packageJson = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
  await fs.rm(WORK, { recursive: true, force: true });
  await fs.mkdir(PACK_DIR, { recursive: true });

  const pack = run("npm", ["pack", "--json", "--pack-destination", PACK_DIR]);
  const payload = JSON.parse(pack.stdout);
  const tarball = path.join(PACK_DIR, payload[0].filename);

  run("npm", ["install", "-g", tarball, "--prefix", PREFIX]);

  const bin = path.join(PREFIX, "bin", "opendocu");
  const help = run(bin, ["--help"]);
  assert(help.stdout.includes(`OpenDocu ${packageJson.version}`), "installed bin should print OpenDocu help");

  await fs.mkdir(SOURCE, { recursive: true });
  await fs.writeFile(
    path.join(SOURCE, "alpha.md"),
    `---
title: "Alpha API"
url: "https://example.com/docs/alpha"
---

# Alpha API

Use \`alpha.configure()\` to configure the package.
`,
  );

  run(bin, ["import", "package-smoke", "1", SOURCE, "--url-base", "https://example.com/docs"], {
    env: { ...process.env, OPENDOCU_HOME: STORE },
  });
  run(bin, ["index"], { env: { ...process.env, OPENDOCU_HOME: STORE } });
  const search = run(bin, ["search", "package-smoke", "alpha.configure", "--version", "1", "--json"], {
    env: { ...process.env, OPENDOCU_HOME: STORE },
  });
  const result = JSON.parse(search.stdout);
  assert(result.results[0]?.doc_id === "package-smoke@1/alpha", "installed CLI should import, index, and search docs");

  run(process.execPath, ["scripts/build_plugin_bundle.mjs", "--out", BUNDLE]);
  const bundleHelp = run(process.execPath, [path.join(BUNDLE, "bin", "opendocu.mjs"), "--help"]);
  assert(bundleHelp.stdout.includes(`OpenDocu ${packageJson.version}`), "plugin bundle bin should print OpenDocu help");

  const bundleBudget = await computePluginBundleBudget(BUNDLE);
  assert(
    bundleBudget.deferredTokens <= 2200,
    `plugin bundle deferred budget should stay below 2200 tokens, got ${bundleBudget.deferredTokens}`,
  );

  console.log(
    JSON.stringify(
      {
        gate: "opendocu-package-smoke",
        status: "pass",
        tarball: path.relative(ROOT, tarball),
        files: payload[0].files?.length || null,
        bundle_deferred_tokens: bundleBudget.deferredTokens,
        top_doc_id: result.results[0].doc_id,
      },
      null,
      2,
    ),
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: options.env || process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

async function computePluginBundleBudget(bundleRoot) {
  const manifestPath = path.join(bundleRoot, ".codex-plugin", "plugin.json");
  const skillPath = path.join(bundleRoot, "skills", "opendocu", "SKILL.md");
  const excludedFiles = new Set([manifestPath, skillPath]);
  const files = await walkFiles(bundleRoot);
  let deferredTokens = 0;
  for (const filePath of files) {
    if (excludedFiles.has(filePath) || !TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      continue;
    }
    const content = await fs.readFile(filePath, "utf8");
    deferredTokens += estimateTokenCount(content);
  }
  return { deferredTokens };
}

async function walkFiles(rootPath) {
  const files = [];

  async function visit(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await visit(entryPath);
        }
        continue;
      }
      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return files.sort();
}

function estimateTokenCount(text) {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  const roughWords = normalized.split(/\s+/u).length;
  const roughChars = Math.ceil(normalized.length / 4);
  return Math.max(roughWords, roughChars);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
