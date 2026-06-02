import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../src/cli.mjs";
import { pagesPath } from "../src/paths.mjs";

test("subcommand --version is parsed as a filter, not the global version flag", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const docPath = path.join(
    store,
    "libraries",
    "nextjs",
    "versions",
    "15",
    "pages",
    "middleware.md",
  );
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(
    docPath,
    `---
library: nextjs
version: "15"
title: Middleware
url: https://nextjs.org/docs/middleware
---

# Middleware

Use NextResponse cookies in middleware.
`,
  );

  const output = [];
  const io = { out: (value) => output.push(value) };
  await runCli(["index", "--store", store], io);
  await runCli(
    ["search", "nextjs", "middleware", "cookies", "--version", "15", "--store", store],
    io,
  );

  assert.match(output.at(-1), /Version: 15/);
  assert.match(output.at(-1), /nextjs@15\/middleware/);
});

test("search supports option-like keywords", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const docPath = path.join(
    store,
    "libraries",
    "node",
    "versions",
    "24",
    "pages",
    "cli.md",
  );
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(
    docPath,
    `---
library: node
version: "24"
title: CLI options
url: https://nodejs.org/api/cli.html
---

# CLI options

Use \`--watch\` for watch mode. Use \`--version\` to print the Node.js version.
`,
  );

  const output = [];
  const io = { out: (value) => output.push(value) };
  await runCli(["index", "--store", store], io);
  await runCli(["search", "node", "--watch", "--version", "24", "--store", store], io);
  assert.match(output.at(-1), /Search: node --watch/);
  assert.match(output.at(-1), /node@24\/cli/);

  await runCli(["search", "node", "--version", "24", "--store", store, "--", "--version"], io);
  assert.match(output.at(-1), /Search: node --version/);
  assert.match(output.at(-1), /node@24\/cli/);
});

test("sqlite search ranks exact symbol-heavy phrases before related token hits", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const relatedPath = path.join(
    store,
    "libraries",
    "tailwindcss",
    "versions",
    "4",
    "pages",
    "hover-focus-and-other-states.mdx",
  );
  const exactPath = path.join(
    store,
    "libraries",
    "tailwindcss",
    "versions",
    "4",
    "pages",
    "styling-with-utility-classes.mdx",
  );
  await fs.mkdir(path.dirname(relatedPath), { recursive: true });
  await fs.writeFile(
    relatedPath,
    `---
library: tailwindcss
version: "4"
title: Hover Focus And Other States
url: https://tailwindcss.com/docs/hover-focus-and-other-states
---

# Hover Focus And Other States

## Data attributes

Use data-active attributes in variants. This related section mentions data-active,
span elements, text color utilities, blue palettes, and 600 shades many times.
data-active span text blue 600 data-active span text blue 600 data-active span text blue 600.
`,
  );
  await fs.writeFile(
    exactPath,
    `---
library: tailwindcss
version: "4"
title: Styling With Utility Classes
url: https://tailwindcss.com/docs/styling-with-utility-classes
---

# Styling With Utility Classes

## Complex selectors

Arbitrary variants let you write selectors directly in a class name:
\`[&>[data-active]+span]:text-blue-600\`.
`,
  );

  const output = [];
  const io = { out: (value) => output.push(value) };
  await runCli(["index", "--store", store], io);
  await runCli(
    [
      "search",
      "tailwindcss",
      "[&>[data-active]+span]:text-blue-600",
      "data-active",
      "--version",
      "4",
      "--store",
      store,
      "--json",
    ],
    io,
  );

  const result = JSON.parse(output.at(-1));
  assert.equal(result.results[0].doc_id, "tailwindcss@4/styling-with-utility-classes");
});

test("default search relaxes from all to any only when strict search is empty", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const docPath = path.join(
    store,
    "libraries",
    "node",
    "versions",
    "24",
    "pages",
    "async-context.md",
  );
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(
    docPath,
    `---
library: node
version: "24"
title: Asynchronous context tracking
url: https://nodejs.org/api/async_context.html
---

# Asynchronous context tracking

AsyncLocalStorage.snapshot() captures the current execution context.
`,
  );

  const output = [];
  const io = { out: (value) => output.push(value) };
  await runCli(["index", "--store", store], io);
  await runCli(
    [
      "search",
      "node",
      "AsyncLocalStorage.snapshot",
      "nonexistentterm",
      "--version",
      "24",
      "--store",
      store,
    ],
    io,
  );

  assert.match(output.at(-1), /Match: any \(relaxed from all\)/);
  assert.match(output.at(-1), /node@24\/async-context/);
});

test("search resolves exact project version to stored major docs version", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const docPath = path.join(
    store,
    "libraries",
    "nextjs",
    "versions",
    "15",
    "pages",
    "middleware.md",
  );
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(
    docPath,
    `---
library: nextjs
version: "15"
title: Middleware
url: https://nextjs.org/docs/app/building-your-application/routing/middleware
---

# Middleware

Use NextResponse cookies in middleware.
`,
  );

  const output = [];
  const io = { out: (value) => output.push(value) };
  await runCli(["index", "--store", store], io);
  await runCli(
    ["search", "nextjs", "middleware", "cookies", "--version", "15.3.2", "--store", store],
    io,
  );

  assert.match(output.at(-1), /Version: 15\.3\.2/);
  assert.match(output.at(-1), /Resolved versions: 15/);
  assert.match(output.at(-1), /nextjs@15\/middleware/);
});

test("resolve and search apply deterministic library aliases", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const docPath = path.join(
    store,
    "libraries",
    "node",
    "versions",
    "24",
    "pages",
    "async-context.md",
  );
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(
    docPath,
    `---
library: node
version: "24"
title: Async context
url: https://nodejs.org/api/async_context.html
---

# Async context

AsyncLocalStorage.snapshot() captures context.
`,
  );

  const output = [];
  const io = { out: (value) => output.push(value) };
  await runCli(["index", "--store", store], io);
  await runCli(["alias", "node-runtime", "node", "--store", store], io);
  await runCli(["resolve", "node-runtime", "--store", store], io);
  assert.match(output.at(-1), /node-runtime -> node \(alias\)/);

  await runCli(
    ["search", "node-runtime", "AsyncLocalStorage.snapshot", "--version", "24", "--store", store],
    io,
  );
  assert.match(output.at(-1), /Resolved library: node-runtime -> node \(alias\)/);
  assert.match(output.at(-1), /node@24\/async-context/);
});

test("search applies built-in library aliases", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const docPath = path.join(
    store,
    "libraries",
    "node",
    "versions",
    "24",
    "pages",
    "async-context.md",
  );
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(
    docPath,
    `---
library: node
version: "24"
title: Async context
url: https://nodejs.org/api/async_context.html
---

# Async context

AsyncLocalStorage.snapshot() captures context.
`,
  );

  const output = [];
  const io = { out: (value) => output.push(value) };
  await runCli(["index", "--store", store], io);
  await runCli(
    ["search", "nodejs", "AsyncLocalStorage.snapshot", "--version", "24", "--store", store],
    io,
  );

  assert.match(output.at(-1), /Resolved library: nodejs -> node \(alias\)/);
  assert.match(output.at(-1), /node@24\/async-context/);
});

test("get supports scoped package libraries with encoded IDs and structured flags", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const library = "@supabase/supabase-js";
  const docPath = path.join(pagesPath(store, library, "2"), "reference/client.md");
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(
    docPath,
    `---
library: "@supabase/supabase-js"
version: "2"
title: Supabase client
url: https://supabase.com/docs/reference/javascript/initializing
---

# Supabase client

Create a Supabase client with createClient.
`,
  );

  const output = [];
  const io = { out: (value) => output.push(value) };
  await runCli(["index", "--store", store], io);
  await runCli(["search", library, "createClient", "--version", "2", "--store", store], io);

  const searchOutput = output.at(-1);
  assert.match(searchOutput, /%40supabase%2Fsupabase-js@2\/reference\/client/);

  await runCli(
    ["get", "%40supabase%2Fsupabase-js@2/reference/client", "--store", store],
    io,
  );
  assert.match(output.at(-1), /Create a Supabase client/);

  await runCli(
    [
      "get",
      "--library",
      library,
      "--version",
      "2",
      "--path",
      "reference/client",
      "--store",
      store,
    ],
    io,
  );
  assert.match(output.at(-1), /Create a Supabase client/);
});

test("get refuses page paths that escape the library pages directory", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const io = { out: () => {} };

  await assert.rejects(
    runCli(
      [
        "get",
        "--library",
        "node",
        "--version",
        "24",
        "--path",
        "../../../../../../secret",
        "--store",
        store,
      ],
      io,
    ),
    /document path escapes library pages/,
  );
});

test("search refuses stale index after a source document is deleted", async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), "opendocu-cli-"));
  const docPath = path.join(
    store,
    "libraries",
    "node",
    "versions",
    "24",
    "pages",
    "async-context.md",
  );
  await fs.mkdir(path.dirname(docPath), { recursive: true });
  await fs.writeFile(
    docPath,
    `---
library: node
version: "24"
title: Async context
url: https://nodejs.org/api/async_context.html
---

# Async context

AsyncLocalStorage.snapshot() captures context.
`,
  );

  const io = { out: () => {} };
  await runCli(["index", "--store", store], io);
  await fs.unlink(docPath);

  await assert.rejects(
    runCli(["search", "node", "AsyncLocalStorage.snapshot", "--version", "24", "--store", store], io),
    /index is stale/,
  );
});
