#!/usr/bin/env node

import { access } from "node:fs/promises";

async function resolveCliModule() {
  const sourceUrl = new URL("../src/cli.mjs", import.meta.url);
  if (await fileExists(sourceUrl)) {
    return sourceUrl;
  }

  const bundledUrl = new URL("../dist/src/cli.mjs", import.meta.url);
  if (await fileExists(bundledUrl)) {
    return bundledUrl;
  }

  throw new Error("OpenDocu CLI runtime is missing; expected src/cli.mjs or dist/src/cli.mjs");
}

async function fileExists(fileUrl) {
  try {
    await access(fileUrl);
    return true;
  } catch {
    return false;
  }
}

const { runCli } = await import((await resolveCliModule()).href);

runCli(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`opendocu: ${message}`);
  process.exitCode = 1;
});
