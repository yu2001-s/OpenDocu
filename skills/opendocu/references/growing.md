# Growing The Store

Grow OpenDocu only from authoritative documentation. The CLI does not fetch from the internet; the agent fetches official docs using available tools, then imports or writes local Markdown/MDX.

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

When docs are HTML or otherwise messy, fetch enough official pages to preserve the relevant area, convert to Markdown/MDX, and write under:

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
