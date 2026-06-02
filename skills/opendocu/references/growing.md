# Growing The Store

Grow OpenDocu only from authoritative documentation. The CLI does not fetch from the internet; the agent fetches official docs using available tools, normalizes any source format into source-backed Markdown/MDX when needed, then imports or writes those pages locally.

## Source Preference

Prefer, in order:

1. Official repository documentation folders for the exact tag or release.
2. Official docs sites with versioned URLs.
3. Official `llms.txt`, sitemap, or docs index pages.
4. Official package README, API docs, release notes, and migration guides.

Avoid blog posts, tutorials, generated mirrors, and third-party snippets unless the user explicitly asks for non-official context.

## Broad Import

If docs are already Markdown/MDX locally, import the tree:

```bash
opendocu import <library> <version> <source-dir> --url-base <official-url-base>
opendocu index
opendocu doctor
```

Examples:

```bash
opendocu import node 24.16.0 ./node/doc/api --url-base https://github.com/nodejs/node/blob/v24.16.0/doc/api
opendocu import react 19.0.0 ./react.dev/src/content/reference --url-base https://github.com/reactjs/react.dev/blob/main/src/content/reference
```

If official docs are available only as local HTML files, import the HTML tree:

```bash
opendocu import-html <library> <version> <source-dir> --url-base <official-url-base>
opendocu index
```

HTML import is deterministic and best-effort. It preserves headings, code blocks, links, canonical URLs, and source hashes, but you should inspect search results and use `opendocu get` for pages with complex tables or custom components.

## Generic Source Formats

For generated docs, structured reference data, API specs, language-native docs, manpages, or dynamic docs sites, follow `source-normalization.md`.

The rule is the same for every source shape: fetch official versioned material, convert it into auditable Markdown/MDX pages with source URLs and provenance metadata, import those pages, run `opendocu index`, then search and `get` from the local store. Do not add separate search commands or use format-specific answer paths.

Common examples include generated site JSON, OpenAPI/AsyncAPI, GraphQL schemas, protobuf references, rustdoc, Go package docs, Javadoc/KDoc, .NET reference docs, and official package README/changelog/example sets.

## Official GitHub Tags

For official docs stored in a GitHub repository, prefer immutable tags or commits. Two reliable patterns:

Sparse clone:

```bash
git clone --depth 1 --branch <tag> --filter=blob:none --sparse <repo-url> <tmp-dir>
git -C <tmp-dir> sparse-checkout set <docs-path>
opendocu import <library> <version> <tmp-dir>/<docs-path> --url-base https://github.com/<org>/<repo>/blob/<tag>/<docs-path>
opendocu index
```

Release tarball:

```bash
curl -L --fail https://github.com/<org>/<repo>/archive/refs/tags/<tag>.tar.gz -o /tmp/docs.tar.gz
tar -xzf /tmp/docs.tar.gz -C /tmp
opendocu import <library> <version> /tmp/<repo>-<tag-without-v>/<docs-path> --url-base https://raw.githubusercontent.com/<org>/<repo>/<tag>/<docs-path>
opendocu index
```

Record the tag or commit in the source URL. Do not import from a moving branch when an exact version is available.

## Manual Page Writes

When docs are HTML or otherwise messy, fetch enough official pages to preserve the relevant area, normalize them to Markdown/MDX, and write under:

```text
${OPENDOCU_HOME:-~/.opendocu}/libraries/<library>/versions/<version>/pages/<path>.md
```

Every page must include frontmatter:

```md
---
library: nextjs
version: "15"
title: Middleware
url: https://nextjs.org/docs/app/building-your-application/routing/middleware
retrieved_at: 2026-06-02T00:00:00Z
content_hash: sha256:...
---
```

Preserve headings, anchors, code fences, parameter tables, version history, stability notes, warnings, and API symbols. Missing niche paragraphs are worse than storing a larger page.

## No-Cheating Rule

Do not create a tiny page tailored only to the user's current question. Store the official page or a coherent official section before searching again. After adding docs, use `opendocu search` and `opendocu get` for the answer.

## Semantic Cards After Growth

After importing broad raw docs, do not try to build a complete semantic graph. Raw official docs are the knowledge base.

Create or update semantic map cards only when retrieval needs a patch: the docs use vocabulary that users are unlikely to search for, a concept spans multiple headings, a real query missed the right raw doc, or repeated questions need aliases/topics/relationships. Run:

```bash
opendocu map validate <library> --version <version>
opendocu index
```

Do not summarize unsupported claims into semantic cards. Cards must point to raw doc IDs and matching `source_hashes`.

For a failed-search feedback loop, follow `retrieval-repair.md`: find the raw evidence first, add a minimal card, validate, index, then replay the failed search.
