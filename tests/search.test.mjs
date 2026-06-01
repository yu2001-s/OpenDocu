import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { buildIndex, initStore } from "../src/indexer.mjs";
import { importMarkdownTree } from "../src/importer.mjs";
import { searchIndex } from "../src/search.mjs";

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
