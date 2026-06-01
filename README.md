# OpenDocu

OpenDocu is a local-first documentation memory for coding agents.

The CLI is intentionally deterministic. It does not fetch from the internet, parse arbitrary websites, summarize docs, or interpret user questions. Agents do that work through the bundled skill. OpenDocu stores versioned Markdown or MDX files, builds a local index, and returns ranked source-backed matches.

## Commands

```bash
opendocu init
opendocu import node 24 ./node/doc/api --url-base https://github.com/nodejs/node/blob/v24.16.0/doc/api
opendocu alias nodejs node
opendocu resolve nodejs
opendocu index
opendocu search nextjs middleware cookies
opendocu search nextjs middleware cookies --version 15 --json
opendocu get nextjs@15/app-router/middleware
opendocu get --library "@supabase/supabase-js" --version 2 --path reference/client
opendocu list
opendocu doctor
```

`search` defaults to `--match auto`: all keywords must match first; if that returns nothing, OpenDocu falls back to any-keyword matching and labels the result as relaxed.
If a requested project version is more specific than the stored docs version, OpenDocu can resolve compatible semver aliases and reports the stored version it searched.
Use `opendocu alias <alias> <library>` to keep local naming consistent, for example `nodejs -> node` or `next -> nextjs`.

Use `OPENDOCU_HOME` or `--store <path>` to choose the store location. The default is `~/.opendocu`.

## Store Layout

Agents write docs as files:

```text
~/.opendocu/
  registry.json
  libraries/
    nextjs/
      versions/
        15/
          pages/
            app-router/
              middleware.mdx
  index/
    opendocu.sqlite
    opendocu.index.json
```

Each page should keep source metadata in frontmatter:

```md
---
library: nextjs
version: "15"
title: Middleware
url: https://nextjs.org/docs/app/building-your-application/routing/middleware
retrieved_at: 2026-06-02T00:00:00Z
content_hash: sha256:...
---

# Middleware

Original documentation content goes here.
```

The Markdown or MDX file is the source of truth. The index file is derived and can be rebuilt.

## Agent Boundary

OpenDocu CLI handles:

- deterministic indexing
- version-aware metadata
- chunk-level search
- BM25 ranking with title, heading, URL, and code-symbol boosts
- health checks

The OpenDocu skill handles:

- deciding the correct library and version
- choosing search keywords
- fetching official docs when local docs are missing
- preserving source material as Markdown or MDX
- running `opendocu index`
- answering from cited local docs

Agents can either write Markdown files directly or use `opendocu import` after fetching an official local docs tree. `import` copies Markdown/MDX files into the store with versioned frontmatter; it does not fetch from the internet.
