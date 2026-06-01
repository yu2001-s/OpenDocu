#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildIndex, initStore } from "../src/indexer.mjs";
import { searchIndex } from "../src/search.mjs";

const SAMPLE_DOCS = [
  {
    library: "nextjs",
    version: "15",
    file: "app/building-your-application/routing/middleware.mdx",
    title: "Middleware",
    url: "https://nextjs.org/docs/app/building-your-application/routing/middleware",
    body: `# Middleware

Middleware allows you to run code before a request is completed.

## Using Cookies

Cookies are regular headers. On a \`NextRequest\`, use \`request.cookies.get('name')\`.
To set response cookies, create a \`NextResponse\` and call \`response.cookies.set('name', 'value')\`.

\`\`\`ts
import { NextResponse } from 'next/server'

export function middleware(request) {
  const response = NextResponse.next()
  response.cookies.set('vercel', 'fast')
  return response
}
\`\`\`
`,
  },
  {
    library: "nextjs",
    version: "15",
    file: "app/api-reference/functions/next-response.mdx",
    title: "NextResponse",
    url: "https://nextjs.org/docs/app/api-reference/functions/next-response",
    body: `# NextResponse

\`NextResponse\` extends the Web Response API with additional convenience methods.

## cookies

The \`cookies\` property exposes methods such as \`get\`, \`getAll\`, \`set\`, and \`delete\`.
`,
  },
  {
    library: "react",
    version: "19",
    file: "reference/react/use-transition.md",
    title: "useTransition",
    url: "https://react.dev/reference/react/useTransition",
    body: `# useTransition

\`useTransition\` is a React Hook that lets you render a part of the UI in the background.

## Actions

Functions called in \`startTransition\` are called Actions. Actions can include side effects and update state.
`,
  },
];

async function main() {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-gate-"));
  await initStore(store);

  for (const doc of SAMPLE_DOCS) {
    await writeDoc(store, doc);
  }

  const index = await buildIndex(store);
  const result = searchIndex(index, {
    library: "nextjs",
    version: "15",
    terms: ["middleware", "cookies", "NextResponse"],
    match: "all",
    limit: 3,
  });

  if (result.results[0]?.doc_id !== "nextjs@15/app/building-your-application/routing/middleware") {
    throw new Error("gate failed: middleware cookie result was not ranked first");
  }

  console.log(JSON.stringify({ store, stats: index.stats, result: result.results[0] }, null, 2));
}

async function writeDoc(store, doc) {
  const fullPath = path.join(
    store,
    "libraries",
    doc.library,
    "versions",
    doc.version,
    "pages",
    doc.file,
  );
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(
    fullPath,
    `---
library: ${doc.library}
version: "${doc.version}"
title: ${doc.title}
url: ${doc.url}
retrieved_at: 2026-06-02T00:00:00Z
content_hash: gate-fixture
---

${doc.body}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
