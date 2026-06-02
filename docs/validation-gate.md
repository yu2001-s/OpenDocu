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

`npm run gate:fixture` is the deterministic release-blocking suite. It starts from an empty store, writes fixture source trees for 10 library scenarios, grows OpenDocu through the real CLI import commands, runs the single indexing command, writes a source-backed semantic card, then checks search, `get`, semantic-map validation, semantic routing through ordinary `opendocu search`, version narrowing, aliases, option-like keywords, sparse-doc no-answer behavior, stale index rejection, path traversal rejection, and skill contract text.

`npm run gate:network` imports broad official Node.js `v24.16.0` documentation from live official sources in both Markdown and HTML form. This is stronger evidence for real docs growth, but it depends on network availability and upstream access.

`npm run gate:package` packs the npm tarball, installs it into a temporary prefix, and verifies the installed `opendocu` binary can import, index, and search a small local source tree.

`npm run gate:release` composes `check`, fixture, package, and network gates.

Real-agent/subagent runs are diagnostic, not the default release blocker. Use them to validate whether the skill naturally causes agents to choose official sources, avoid full natural-language searches, run `opendocu index`, use `opendocu get`, and answer from local evidence. Keep expected answers hidden from the agent and score transcripts with concrete command/evidence checks.

## Scenario Matrix

The deterministic fixture gate covers:

- excellent docs: Node.js, React, Next.js
- good docs: TypeScript, Rust, Python
- medium SDK/runtime docs: Stripe, Supabase, Cloudflare Workers
- poor/sparse docs: a tiny cache package with missing TTL coverage
- Markdown and HTML import paths
- exact versions, major-only docs, and minor-version exclusion
- scoped package IDs
- aliases such as `nodejs -> node`
- API symbols such as `AsyncLocalStorage.snapshot`, `Option::unwrap_or_else`, and `ctx.waitUntil`
- option-like keywords such as `--watch` and `--version`
- negative evidence when local docs are too thin
- source-hash validated semantic cards for agent-native retrieval routing

Minimum acceptance:

- version-filtered search excludes other versions
- exact API symbols are searchable
- headings and titles rank relevant chunks above incidental mentions
- source URLs are present in search results
- `opendocu doctor` reports a ready index

Higher-standard acceptance:

- an independent agent can start with an empty store, read the OpenDocu skill, fetch official docs, import or write them, index them, and answer from local OpenDocu results
- the same gate includes at least one exact API symbol, one option/property name, one version/stability note, and one overloaded/common keyword where raw search produces many false positives
- the report records any agent improvisation so the skill can be tightened
