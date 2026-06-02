# OpenDocu

OpenDocu is a local-first documentation memory for coding agents.

The CLI is intentionally deterministic. It does not fetch from the internet, parse arbitrary websites, summarize docs, or interpret user questions. Agents do that work through the bundled skill. OpenDocu stores versioned Markdown or MDX files, builds one raw-doc search index, and returns ranked source-backed matches.

## Install

```bash
npm install -g opendocu
opendocu --help
```

From this repository:

```bash
npm install
node bin/opendocu.mjs --help
```

Agent install prompt:

```text
Install the OpenDocu coding-agent plugin from https://github.com/yu2001-s/OpenDocu.
```

## Commands

Raw official-doc workflow:

```bash
opendocu init
opendocu import node 24 ./node/doc/api --url-base https://github.com/nodejs/node/blob/v24.16.0/doc/api
opendocu import-html node 24 ./node-html/api --url-base https://nodejs.org/download/release/v24.16.0/docs/api
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

Semantic map maintenance, after raw docs exist:

```bash
opendocu map init node 24.16.0
opendocu map validate node --version 24.16.0
opendocu index
opendocu search node AsyncLocalStorage snapshot --version 24.16.0
```

`search` defaults to `--match auto`: all keywords must match first; if that returns nothing, OpenDocu falls back to any-keyword matching and labels the result as relaxed.
If a requested project version is more specific than the stored docs version, OpenDocu can resolve compatible semver aliases and reports the stored version it searched.
Use `opendocu alias <alias> <library>` to keep local naming consistent, for example `nodejs -> node` or `next -> nextjs`.

Use `OPENDOCU_HOME` or `--store <path>` to choose the store location. The default is `~/.opendocu`.

## Importing Docs

OpenDocu imports local files only. Fetch official docs with your agent or normal shell tools first.

Markdown/MDX:

```bash
opendocu import node 24.16.0 ./node/doc/api \
  --url-base https://github.com/nodejs/node/blob/v24.16.0/doc/api
opendocu index
```

HTML:

```bash
opendocu import-html node 24.16.0 ./node-html/api \
  --url-base https://nodejs.org/download/release/v24.16.0/docs/api
opendocu index
```

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
          map/
            README.md
            log.md
            apis/
              middleware-cookies.md
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

The Markdown or MDX file under `pages/` is the source of truth. `opendocu index` is the only indexing command; it builds both the SQLite search artifact and JSON debug artifact under `index/`, and activates valid semantic map cards.

The `map/` directory is an agent-maintained semantic layer for aliases, topics, reusable summaries, concept pages, comparisons, and cross-links. It is not a second source of truth and does not have its own search interface. Semantic cards must reference raw OpenDocu doc IDs and matching source hashes; `opendocu index` excludes invalid cards and `opendocu search` uses active cards only to route and rank raw official doc evidence.

## Agent Boundary

OpenDocu CLI handles:

- deterministic raw-doc indexing
- version-aware metadata
- chunk-level search
- semantic map initialization, validation, activation, and source-hash enforcement
- BM25 ranking with title, heading, URL, and code-symbol boosts
- health checks

The OpenDocu skill handles:

- deciding the correct library and version
- choosing search keywords
- fetching official docs when local docs are missing
- preserving source material as Markdown or MDX
- maintaining semantic cards when aliases, topics, or relationships improve retrieval
- running `opendocu index`
- answering from cited local docs

Agents can write Markdown files directly, use `opendocu import` after fetching an official Markdown/MDX docs tree, or use `opendocu import-html` after fetching an official HTML docs tree. Import commands do not fetch from the internet.

## Agent Adapters

OpenDocu is packaged as a Codex plugin and a Claude Code plugin. Other shell-capable agents can use the same CLI through `AGENTS.md`.

- Codex: `.codex-plugin/plugin.json` plus `skills/opendocu/SKILL.md`.
- Claude Code: `.claude-plugin/plugin.json`, `skills/opendocu/SKILL.md`, and `/opendocu:search`.
- Generic agents: read `AGENTS.md` and call the deterministic CLI.

See `docs/agent-adapters.md` for the support matrix and adapter contract.

## Validation

```bash
npm run check
npm run gate:fixture
npm run gate:network
npm run gate:release
```

The fixture gate grows an empty store across 10 library scenarios, then checks retrieval, version boundaries, option-like keywords, sparse-doc behavior, `get`, stale index rejection, and skill contracts.
The network gates import official Node.js `v24.16.0` docs in both Markdown and HTML forms, then ask niche versioned API questions through OpenDocu search.
