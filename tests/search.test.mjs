import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { buildIndex, initStore } from "../src/indexer.mjs";
import { importHtmlTree, importMarkdownTree } from "../src/importer.mjs";
import { searchIndex } from "../src/search.mjs";
import { resolveVersionCandidates } from "../src/versioning.mjs";

test("indexes versioned markdown and returns source-backed chunk matches", async () => {
  const store = await makeStore();
  await writeDoc(
    store,
    "nextjs",
    "15",
    "app-router/middleware.mdx",
    `---
library: nextjs
version: "15"
title: Middleware
url: https://nextjs.org/docs/app/building-your-application/routing/middleware
retrieved_at: 2026-06-02T00:00:00Z
---

# Middleware

You can set response cookies in Middleware by returning a \`NextResponse\`.

\`\`\`ts
const response = NextResponse.next()
response.cookies.set('vercel', 'fast')
return response
\`\`\`
`,
  );

  const index = await buildIndex(store);
  const result = searchIndex(index, {
    library: "nextjs",
    version: "15",
    terms: ["middleware", "cookies", "NextResponse"],
    match: "all",
    limit: 5,
  });

  assert.equal(result.count, 1);
  assert.equal(result.results[0].doc_id, "nextjs@15/app-router/middleware");
  assert.equal(
    result.results[0].url,
    "https://nextjs.org/docs/app/building-your-application/routing/middleware",
  );
  assert.match(result.results[0].snippet, /NextResponse/);
});

test("keeps versions separate", async () => {
  const store = await makeStore();
  await writeDoc(
    store,
    "react",
    "18",
    "reference/use-transition.md",
    frontmatter("react", "18", "useTransition", "https://react.dev/reference/react/useTransition") +
      "\n# useTransition\n\nReact 18 has the classic useTransition API.\n",
  );
  await writeDoc(
    store,
    "react",
    "19",
    "reference/use-transition.md",
    frontmatter("react", "19", "useTransition", "https://react.dev/reference/react/useTransition") +
      "\n# useTransition\n\nReact 19 documents Actions inside transitions.\n",
  );

  const index = await buildIndex(store);
  const result = searchIndex(index, {
    library: "react",
    version: "19",
    terms: ["Actions", "transitions"],
    match: "all",
    limit: 5,
  });

  assert.equal(result.count, 1);
  assert.equal(result.results[0].doc_id, "react@19/reference/use-transition");
});

test("version resolution avoids newer minor versions for specific project versions", () => {
  assert.deepEqual(
    resolveVersionCandidates(["15.2", "15.4"], "15.3.2"),
    ["15.3.2"],
  );
  assert.deepEqual(
    resolveVersionCandidates(["15.2", "15.3.1", "15.4"], "15.3.2"),
    ["15.3.1"],
  );
  assert.deepEqual(
    resolveVersionCandidates(["15", "15.4"], "15.3.2"),
    ["15"],
  );
});

test("symbol-aware tokenization finds niche API symbols", async () => {
  const store = await makeStore();
  await writeDoc(
    store,
    "node",
    "22",
    "api/async-context.md",
    frontmatter("node", "22", "AsyncLocalStorage", "https://nodejs.org/api/async_context.html") +
      "\n# AsyncLocalStorage\n\nThe method `AsyncLocalStorage.snapshot()` captures the current execution context.\n",
  );

  const index = await buildIndex(store);
  const result = searchIndex(index, {
    library: "node",
    version: "22",
    terms: ["AsyncLocalStorage.snapshot"],
    match: "all",
    limit: 5,
  });

  assert.equal(result.count, 1);
  assert.equal(result.results[0].doc_id, "node@22/api/async-context");
});

test("underscore symbols are searchable with separated words", async () => {
  const store = await makeStore();
  await writeDoc(
    store,
    "node",
    "24",
    "api/diagnostics-channel.md",
    frontmatter("node", "24", "Diagnostics Channel", "https://nodejs.org/api/diagnostics_channel.html") +
      "\n# Diagnostics Channel\n\nUse `diagnostics_channel.tracingChannel()` to create tracing channels.\n",
  );

  const index = await buildIndex(store);
  const result = searchIndex(index, {
    library: "node",
    version: "24",
    terms: ["diagnostics", "channel", "tracingChannel"],
    match: "all",
    limit: 5,
  });

  assert.equal(result.count, 1);
  assert.equal(result.results[0].doc_id, "node@24/api/diagnostics-channel");
});

test("imports a local markdown tree with version metadata", async () => {
  const source = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-source-"));
  await fs.mkdir(path.join(source, "api"), { recursive: true });
  await fs.writeFile(
    path.join(source, "api", "diagnostics-channel.md"),
    `---
title: Official Diagnostics Channel
url: https://nodejs.org/api/diagnostics_channel.html
stability: stable
source_format: structured-json
source_adapter: official-doc-normalizer
---

# Diagnostics Channel

The \`diagnostics_channel.tracingChannel()\` API creates tracing channels.
`,
  );

  const store = await makeStore();
  const imported = await importMarkdownTree(store, {
    library: "node",
    version: "24",
    sourceDir: source,
    urlBase: "https://github.com/nodejs/node/blob/v24.16.0/doc/api",
  });

  assert.equal(imported.written.length, 1);
  const stored = await fs.readFile(imported.written[0], "utf8");
  assert.match(stored, /title: "Official Diagnostics Channel"/);
  assert.match(stored, /url: "https:\/\/nodejs\.org\/api\/diagnostics_channel\.html"/);
  assert.match(stored, /source_stability: "stable"/);
  assert.match(stored, /source_format: "structured-json"/);
  assert.match(stored, /source_adapter: "official-doc-normalizer"/);
  assert.doesNotMatch(stored, /source_source_format/);
  assert.match(stored, /^---\n[\s\S]+?\n---\n\n# Diagnostics Channel/);

  const index = await buildIndex(store);
  const result = searchIndex(index, {
    library: "node",
    version: "24",
    terms: ["diagnostics_channel.tracingChannel"],
    match: "all",
    limit: 5,
  });

  assert.equal(result.count, 1);
  assert.equal(result.results[0].doc_id, "node@24/api/diagnostics-channel");
});

test("imports local HTML docs into searchable markdown", async () => {
  const source = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-html-source-"));
  await fs.mkdir(path.join(source, "api"), { recursive: true });
  await fs.writeFile(
    path.join(source, "api", "async_context.html"),
    `<!doctype html>
<html>
  <head>
    <title>Asynchronous context tracking | Node.js</title>
    <link rel="canonical" href="https://nodejs.org/api/async_context.html">
  </head>
  <body>
    <nav>Navigation should not be indexed.</nav>
    <main>
      <h1>Asynchronous context tracking</h1>
      <h3>Static method: <code>AsyncLocalStorage.snapshot()</code><a href="#snapshot">#</a></h3>
      <p>Returns a new function that captures the current execution context.</p>
      <pre><code>const runInAsyncScope = AsyncLocalStorage.snapshot()</code></pre>
    </main>
  </body>
</html>
`,
  );

  const store = await makeStore();
  const imported = await importHtmlTree(store, {
    library: "node",
    version: "24",
    sourceDir: path.join(source, "api"),
    urlBase: "https://nodejs.org/download/release/v24.16.0/docs/api",
  });

  assert.equal(imported.written.length, 1);
  const stored = await fs.readFile(imported.written[0], "utf8");
  assert.match(stored, /source_format: "html"/);
  assert.match(stored, /url: "https:\/\/nodejs\.org\/download\/release\/v24\.16\.0\/docs\/api\/async_context\.html"/);
  assert.match(stored, /source_canonical: "https:\/\/nodejs\.org\/api\/async_context\.html"/);
  assert.match(stored, /### Static method: `AsyncLocalStorage.snapshot\(\)`/);
  assert.doesNotMatch(stored, /snapshot\(\)#/);
  assert.doesNotMatch(stored, /Navigation should not be indexed/);

  const index = await buildIndex(store);
  const result = searchIndex(index, {
    library: "node",
    version: "24",
    terms: ["AsyncLocalStorage.snapshot", "context"],
    match: "all",
    limit: 5,
  });

  assert.ok(result.count >= 1);
  assert.equal(result.results[0].doc_id, "node@24/async_context");
});

test("indexes tokens that collide with object prototype names", async () => {
  const store = await makeStore();
  await writeDoc(
    store,
    "js",
    "1",
    "objects/prototype.md",
    frontmatter("js", "1", "Prototype keys", "https://example.test/prototype") +
      "\n# Prototype keys\n\nA code block may contain `__proto__`, `constructor`, or `toString`.\n",
  );

  const index = await buildIndex(store);
  const result = searchIndex(index, {
    library: "js",
    version: "1",
    terms: ["__proto__"],
    match: "all",
    limit: 5,
  });

  assert.equal(result.count, 1);
});

async function makeStore() {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-test-"));
  await initStore(store);
  return store;
}

async function writeDoc(store, library, version, relativePath, content) {
  const fullPath = path.join(
    store,
    "libraries",
    library,
    "versions",
    version,
    "pages",
    relativePath,
  );
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content);
}

function frontmatter(library, version, title, url) {
  return `---
library: ${library}
version: "${version}"
title: ${title}
url: ${url}
retrieved_at: 2026-06-02T00:00:00Z
---`;
}
