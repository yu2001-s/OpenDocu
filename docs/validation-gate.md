# Validation Gate

The gate is intentionally adversarial:

1. Pick a large official documentation source before choosing questions.
2. Import or write a broad set of pages into an empty OpenDocu store.
3. Run `opendocu index`.
4. Ask niche questions whose answers exist in the imported docs.
5. Let the agent choose keywords and use only `opendocu search` or `opendocu get` for local retrieval.
6. Verify the final answer cites the stored source URL and version.
7. Compare against plain filesystem search. OpenDocu should return ranked chunks with version, source URL, heading, and snippet in fewer steps than raw `rg`.

Do not create targeted files after seeing the niche questions. That would invalidate the gate.

Run the current real gate with:

```bash
npm run gate:release
```

## Gate Modes

`npm run gate:fixture` is the deterministic release-blocking suite. It starts from an empty store, writes fixture source trees for 10 library scenarios, grows OpenDocu through the real CLI import commands, runs the single indexing command, writes a source-backed semantic card as a retrieval patch, then checks search, `get`, semantic-map validation, semantic routing through ordinary `opendocu search`, version narrowing, aliases, option-like keywords, sparse-doc no-answer behavior, stale index rejection, path traversal rejection, and skill contract text.

`npm run gate:workflow-sim` is a deterministic scripted workflow simulation. It starts from an empty store, imports official-source docs through the real CLI, indexes, checks `doctor`, records a failed alias-style search, finds the raw evidence with better terms and `opendocu get`, creates a source-hash validated semantic card, re-indexes, replays the failed search, and then runs multiple scripted query personas from natural-language user questions. Each persona must choose keywords instead of passing the full question, pass the relevant version, use ordinary `opendocu search`, call `opendocu get` before answering when evidence exists, and refuse to answer when local evidence is missing.

This is not an autonomous-agent ingestion test. It does not prove an agent can read messy raw docs, decide what to preserve, or maintain a complete semantic graph. It proves the CLI and skill contract can support source-first retrieval and failure-driven semantic-card repair when the agent's choices are expressed as commands.

`npm run gate:network` imports broad official Node.js `v24.16.0` documentation from live official sources in both Markdown and HTML form. This is stronger evidence for real docs growth, but it depends on network availability and upstream access.

`npm run gate:normalization` starts from a structured official-source fixture rather than Markdown or HTML. It normalizes generated API data into source-backed Markdown pages, imports them through the real CLI, indexes, checks provenance metadata, searches exact symbols and niche parameter terms, reads raw pages with `opendocu get`, and confirms absent local evidence stays absent.

`npm run gate:package` packs the npm tarball, installs it into a temporary prefix, and verifies the installed `opendocu` binary can import, index, and search a small local source tree.

`npm run gate:release` composes `check`, fixture, workflow simulation, package, and network gates.

Real-agent/subagent runs are diagnostic, not the default release blocker. Use `npm run eval:live:plan` to generate a five-set blind live-agent eval, then score reports with `npm run eval:live:score -- <run-dir>`. The eval validates whether agents naturally choose official sources, grow broad docs, avoid full natural-language searches, run `opendocu index`, use `opendocu get`, and answer from local evidence. Keep expected answers hidden from grower and query agents. See `docs/live-agent-eval.md`.

## Scenario Matrix

The deterministic fixture gate covers:

- excellent docs: Node.js, React, Next.js
- good docs: TypeScript, Rust, Python
- medium SDK/runtime docs: Stripe, Supabase, Cloudflare Workers
- poor/sparse docs: a tiny cache package with missing TTL coverage
- Markdown and HTML import paths
- generic source normalization from structured official data into Markdown/MDX
- exact versions, major-only docs, and minor-version exclusion
- scoped package IDs
- aliases such as `nodejs -> node`
- API symbols such as `AsyncLocalStorage.snapshot`, `Option::unwrap_or_else`, and `ctx.waitUntil`
- option-like keywords such as `--watch` and `--version`
- negative evidence when local docs are too thin
- source-hash validated semantic cards for failure-driven retrieval routing

Minimum acceptance:

- version-filtered search excludes other versions
- exact API symbols are searchable
- headings and titles rank relevant chunks above incidental mentions
- source URLs are present in search results
- `opendocu doctor` reports a ready index
- a failed search can be repaired only after raw evidence is found and replayed through ordinary `opendocu search`
- normalized non-Markdown official sources keep clean `source_format`, `source_adapter`, and source URL provenance

Higher-standard acceptance:

- five independent live-agent eval sets can start with empty stores, grow official docs, index, and answer multiple hidden queries from local OpenDocu results
- the same gate includes at least one exact API symbol, one option/property name, one version/stability note, one negative/no-evidence query, and one alias query that needs a source-backed retrieval patch
- the report records any agent improvisation so the skill can be tightened
