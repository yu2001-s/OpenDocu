import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../src/cli.mjs";
import { pagesPath, semanticMapPath } from "../src/paths.mjs";

test("semantic map cards are activated by index and route normal search to raw docs", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-map-"));
  const source = await makeSourceDoc();
  const output = [];
  const io = { out: (value) => output.push(value) };

  await runCli(["import", "node", "24", source, "--url-base", "https://nodejs.org/api", "--store", store], io);
  await runCli(["index", "--store", store], io);
  await runCli(["search", "node", "resume", "saved", "scope", "--version", "24", "--match", "all", "--json", "--store", store], io);
  const preRepair = JSON.parse(output.at(-1));
  assert.equal(preRepair.results.length, 0);

  await runCli(["map", "init", "node", "24", "--store", store], io);
  await assert.doesNotReject(fs.access(path.join(semanticMapPath(store, "node", "24"), "README.md")));

  const rawDoc = await fs.readFile(path.join(pagesPath(store, "node", "24"), "api/async-context.md"), "utf8");
  const sourceHash = /content_hash: "([^"]+)"/.exec(rawDoc)?.[1];
  assert.ok(sourceHash);

  const mapCard = path.join(semanticMapPath(store, "node", "24"), "apis/snapshot.md");
  await fs.mkdir(path.dirname(mapCard), { recursive: true });
  await fs.writeFile(
    mapCard,
    `---
library: "node"
version: "24"
title: "AsyncLocalStorage snapshot"
kind: "api"
sources: "node@24/api/async-context"
source_hashes: "${sourceHash}"
aliases: "snapshot, captured context, execution context, resume saved scope"
topics: "async context, context propagation"
edges: "node@24/api/async-context#AsyncLocalStorage.run"
---

# AsyncLocalStorage snapshot

Retrieval patch for user wording around resuming a saved async scope.
`,
  );

  await runCli(["map", "validate", "node", "--version", "24", "--json", "--store", store], io);
  const validation = JSON.parse(output.at(-1));
  assert.equal(validation.status, "pass");
  assert.equal(validation.cards[0].sources[0].hash_ok, true);

  await runCli(["map", "list", "node", "--version", "24", "--json", "--store", store], io);
  const list = JSON.parse(output.at(-1));
  assert.equal(list.cards[0].relativePath, "apis/snapshot.md");

  await assert.rejects(
    runCli(["search", "node", "captured", "--version", "24", "--json", "--store", store], io),
    /index is stale/,
  );

  await runCli(["index", "--store", store], io);
  await runCli(["search", "node", "resume", "saved", "scope", "--version", "24", "--match", "all", "--json", "--store", store], io);
  const search = JSON.parse(output.at(-1));
  assert.equal(search.results[0].doc_id, "node@24/api/async-context");
  assert.equal(search.results[0].semantic_matches[0].title, "AsyncLocalStorage snapshot");
  assert.equal(search.semantic_map.active_cards, 1);
  assert.equal(search.semantic_map.matched_cards, 1);

  await runCli(["get", "node@24/api/async-context", "--store", store], io);
  assert.match(output.at(-1), /AsyncLocalStorage\.snapshot\(\)/);
});

test("invalid semantic cards are excluded from search but reported by index", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-map-"));
  const source = await makeSourceDoc();
  const output = [];
  const io = { out: (value) => output.push(value) };

  await runCli(["import", "node", "24", source, "--url-base", "https://nodejs.org/api", "--store", store], io);
  await runCli(["map", "init", "node", "24", "--store", store], io);

  const mapCard = path.join(semanticMapPath(store, "node", "24"), "apis/snapshot.md");
  await fs.mkdir(path.dirname(mapCard), { recursive: true });
  await fs.writeFile(
    mapCard,
    `---
library: "node"
version: "24"
title: "AsyncLocalStorage snapshot"
kind: "api"
sources: "node@24/api/async-context"
source_hashes: "sha256:not-the-source"
aliases: "captured context"
---

# AsyncLocalStorage snapshot
`,
  );

  await assert.rejects(
    runCli(["map", "validate", "node", "--version", "24", "--json", "--store", store], io),
    /semantic map validation failed/,
  );
  const validation = JSON.parse(output.at(-1));
  assert.equal(validation.status, "fail");
  assert.match(validation.errors.join("\n"), /source hash mismatch/);

  await runCli(["index", "--store", store], io);
  assert.match(output.at(-1), /Semantic map: 0 active, 1 invalid\/excluded/);

  await runCli(["search", "node", "captured", "--version", "24", "--json", "--store", store], io);
  const search = JSON.parse(output.at(-1));
  assert.equal(search.results.length, 0);
});

async function makeSourceDoc() {
  const source = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-map-source-"));
  await fs.mkdir(path.join(source, "api"), { recursive: true });
  await fs.writeFile(
    path.join(source, "api", "async-context.md"),
    `---
title: "Async context"
url: "https://nodejs.org/api/async_context.html"
---

# Async context

## Static method: AsyncLocalStorage.snapshot()

\`AsyncLocalStorage.snapshot()\` captures the current execution context.
`,
  );
  return source;
}
