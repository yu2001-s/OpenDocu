# OpenDocu Architecture

OpenDocu has two layers.

The CLI is deterministic infrastructure:

- initialize a local store
- import a local Markdown or MDX docs tree into versioned storage
- scan versioned Markdown and MDX files
- build a derived inverted index
- search with keyword groups and BM25 ranking
- return source URLs, file paths, versions, headings, and snippets
- diagnose stale or invalid stores

The skill is the intelligence layer:

- infer the library and version from the project
- choose search terms from the user's request
- fetch official documentation with the agent's normal tools when local docs are missing
- preserve original docs as Markdown or MDX
- run `opendocu index`
- search again and answer from cited local material

## Source Of Truth

Markdown and MDX files under `libraries/<library>/versions/<version>/pages/` are canonical. The JSON index under `index/` is disposable and must be rebuilt whenever files change.

## Search Reliability

The index is chunk-level, not line-level. Chunks keep page title, heading path, source URL, file path, and body text together, so a result is useful to an agent without requiring a second filesystem search.

Search uses a native SQLite FTS index for CLI queries and keeps a JSON index artifact for debugging and portability. The tokenizer preserves API-like symbols and also indexes their parts. For example, `AsyncLocalStorage.snapshot()` contributes tokens for the full symbol and useful parts such as `asynclocalstorage`, `async`, `local`, `storage`, and `snapshot`.

Search defaults to `--match auto`, where strict all-keyword matching is attempted first and any-keyword matching is used only if strict matching is empty. Agents should still retry with better keywords instead of passing full natural-language questions.

OpenDocu refuses normal searches when the index is stale. Staleness includes missing index files, source files newer than the index, or indexed source files that have been deleted.

## Versioning

Every document belongs to a library and version. Frontmatter is preferred:

```yaml
library: nextjs
version: "15"
title: Middleware
url: https://nextjs.org/docs/app/building-your-application/routing/middleware
retrieved_at: 2026-06-02T00:00:00Z
content_hash: sha256:...
```

If frontmatter is missing, the indexer derives library and version from the directory path. The skill should still write explicit frontmatter so results are auditable.

Library names and versions are encoded in storage paths and document IDs so scoped/slashed packages are unambiguous. Search results include readable `library` and `version` fields; `opendocu get --library <name> --version <version> --path <path>` avoids requiring users to type encoded IDs.

Search resolves common semver aliases. If docs are stored as `15`, a request for `15.3.2` can resolve to the stored `15` docs and the CLI reports the resolved version.

The local registry supports deterministic library aliases through `opendocu alias <alias> <library>` and `opendocu resolve <library>`. Search applies aliases before querying, which helps avoid duplicate local stores for names like `nodejs` and `node`.
