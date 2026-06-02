---
description: Search OpenDocu local versioned official docs using explicit library keywords.
argument-hint: "<library> <keyword...> [--version <version>]"
disable-model-invocation: true
---

Search OpenDocu for `$ARGUMENTS`.

Use the deterministic CLI only. Prefer `opendocu`; if it is unavailable in this plugin session, use `node "${CLAUDE_PLUGIN_ROOT}/bin/opendocu.mjs"`.

Rules:

- Convert `$ARGUMENTS` into an `opendocu search` call with explicit library and keywords.
- Do not search with a full natural-language question.
- Pass `--version` when the requested or project version is known.
- Use `opendocu get` for the best result when full-page context is needed.
- Treat semantic cards as optional routing hints; final evidence must come from raw docs.
- Answer from retrieved local docs and mention version/source when version correctness matters.
