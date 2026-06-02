# Context7 Comparison

Context7's public interface centers on two retrieval tools:

- resolve a general library name into a Context7-compatible library ID
- fetch docs for that ID, optionally focused by topic, page, token budget, or versioned ID

Its CLI also fetches library documentation, manages skills, and configures MCP clients.

OpenDocu intentionally starts from a different boundary:

- local Markdown/MDX files are the source of truth
- SQLite FTS and JSON debug artifacts are derived from one `opendocu index` run
- the CLI is deterministic and does not fetch or summarize websites
- the skill teaches agents how to fetch official docs, grow the store, index, and search

## Competitive Bar

OpenDocu should meet or beat Context7 on:

- version-specific answers
- official-source citation
- niche API-symbol retrieval
- offline reuse after first import
- transparent inspectable storage
- agent workflow reliability
- deterministic local library aliases through `resolve` and `alias`

Context7 is still ahead on:

- global hosted docs coverage
- global built-in library resolution
- zero-setup docs fetch
- MCP-native integrations

## OpenDocu Gates

Passing gates should prove more than search speed:

- start from an empty store
- fetch or import broad official docs before questions are answered
- preserve version metadata and source URLs
- answer niche questions from `opendocu search` and `opendocu get`
- use an independent agent forward test without leaking the expected answer

Raw filesystem search may be faster on small corpora. OpenDocu must be better for coding agents by returning ranked chunks with version, heading path, source URL, snippets, and machine-readable JSON.
