# Validation Report

This report records the first v1 non-synthetic gates for OpenDocu.

## Corpus

- Source: official Node.js repository
- Tag: `v24.16.0`
- Commit: `c7d10158bc31036de6783d66beaaaf551e3167aa`
- Imported path: `doc/api`
- Imported docs: 67 Markdown files
- Indexed chunks: 5,119
- Indexed terms: 29,010

The gate imports the broad official docs tree before running niche searches. It does not add targeted pages for the questions.

## Niche Searches

| Question shape | OpenDocu keywords | Top result |
| --- | --- | --- |
| Capture async context for later use | `AsyncLocalStorage.snapshot context` | `node@24.16.0/async_context`, heading `Static method: AsyncLocalStorage.snapshot()` |
| Check tracing channel subscribers | `diagnostics_channel tracingChannel hasSubscribers` | `node@24.16.0/diagnostics_channel`, heading `tracingChannel.hasSubscribers` |
| Compose streams as a duplex | `stream compose Duplex` | `node@24.16.0/stream`, heading `stream.compose(...streams)` |
| Create an aborting signal after a delay | `AbortSignal timeout signal` | `node@24.16.0/globals`, heading `Static method: AbortSignal.timeout(delay)` |

## Independent Agent Forward Test

An independent subagent started from an empty store at `/tmp/opendocu-node-24.16.0-store`, used the OpenDocu skill, fetched the official Node.js `v24.16.0` docs tarball, imported `doc/api`, indexed the store, searched OpenDocu, and answered the `AsyncLocalStorage.snapshot()` question with version and source URL.

The agent reported the skill was sufficient. The only improvisation was choosing the concrete `curl`/`tar` fetch method, which is now documented in `skills/opendocu/references/growing.md`.

## Raw Search Comparison

For `AsyncLocalStorage.snapshot|context`, raw `rg` over the same stored docs returned 918 line hits. OpenDocu returned the exact versioned API chunk first, including heading path, source URL, file path, snippet, and version.

Cold timing on this machine:

- OpenDocu SQLite FTS search: about 0.10s
- Raw `rg`: about 0.02s

Raw `rg` is still faster on a 4 MB corpus. OpenDocu is currently better on agent usefulness: ranked chunks, strict version scope, citations, and structured JSON. If absolute latency over raw search is required, the next step is a persistent daemon or a native binary CLI.

## HTML Gate

- Source: official Node.js release HTML docs
- URL root: `https://nodejs.org/download/release/v24.16.0/docs/api`
- Imported pages: `async_context.html`, `diagnostics_channel.html`, `globals.html`, `stream.html`
- Indexed docs: 4
- Indexed chunks: 365
- Indexed terms: 3,951

HTML import preserved versioned source URLs and ranked these niche sections first:

| Question shape | OpenDocu keywords | Top result |
| --- | --- | --- |
| Capture async context for later use | `AsyncLocalStorage.snapshot context` | `node-html@24.16.0/async_context`, heading `Static method: AsyncLocalStorage.snapshot()` |
| Check tracing channel subscribers | `diagnostics_channel tracingChannel hasSubscribers` | `node-html@24.16.0/diagnostics_channel`, heading `tracingChannel.hasSubscribers` |
| Create an aborting signal after a delay | `AbortSignal timeout signal` | `node-html@24.16.0/globals`, heading `Static method: AbortSignal.timeout(delay)` |

## Semantic Map Fixture Gate

The deterministic release fixture initializes a semantic map for `node@24.16.0`, records an alias-style search miss, finds the raw `AsyncLocalStorage.snapshot()` page with better terms, writes a source-backed retrieval card, validates its `sources` and `source_hashes` against the imported raw docs, rebuilds the index, and confirms ordinary `opendocu search` routes the original failed query back to the raw official doc.

The semantic map remains routing metadata. Final answers still verify claims through raw docs with `opendocu get`.

## Workflow Simulation Gate

`npm run gate:workflow-sim` covers the CLI workflow shape in a repeatable way. It starts with an empty store, imports official Node.js docs through the CLI, indexes raw docs first, checks `doctor`, records a failed user-phrasing search, finds the raw evidence, creates a source-backed semantic card, validates it, re-indexes, replays the failed search, and checks `doctor` again.

It then runs multiple scripted query personas against that grown store:

| Persona | User question shape | Required behavior |
| --- | --- | --- |
| Easy API | `AsyncLocalStorage.snapshot()` | keyword search, version filter, `get`, raw evidence |
| Option keyword | `--watch` | option-like keyword handling |
| Known CLI flag | `--version` | `--` separator before the searched flag |
| Retrieval repair | saved scope phrasing | raw doc result with semantic routing hint after replay |
| No evidence | missing `AbortSignal.timeout()` page | no answer from absent local evidence |

This gate is deterministic CI evidence for the mechanics of the grow/search/get workflow and failure-driven retrieval repair. It does not prove autonomous ingestion quality. Live subagent runs remain necessary spot checks for whether agents naturally choose the right official sources, import broad enough docs, repair retrieval only when raw evidence exists, and answer from local evidence.

## Source Normalization Gate

`npm run gate:normalization` covers the generic ingestion path for docs that are neither Markdown nor simple HTML. The gate starts with structured official-source records, normalizes them into Markdown pages with official URLs, `source_format`, `source_adapter`, and source identifiers, imports those pages through the real CLI, indexes, and verifies exact-symbol search, niche parameter search, `opendocu get`, and no-evidence behavior.

This is the release check for the generic adapter contract. OpenDocu does not need built-in product-specific search paths for generated docs, API specs, language-native references, or manpages; those sources must become source-backed pages before indexing.

## Live-Agent Eval Harness

`npm run eval:live:plan` generates a manual five-set blind eval for Node.js, React, Next.js, Python, and README-centric package docs. Each set starts from an empty store, gives one grower agent only the library/version and official-source rule, then runs independent query agents against the grown store. Query sets include easy lookups, exact symbols, version-specific details, cross-page concepts, semantic-alias phrasing, and negative/no-evidence questions.

`npm run eval:live:score -- <run-dir>` scores the JSON reports for official sources, index/doctor readiness, versioned search, `opendocu get`, cited raw docs, and correct refusal behavior. This is the release diagnostic for autonomous ingestion quality; deterministic gates remain the release-blocking CLI checks. Do not interpret low card counts as failure when raw-doc retrieval answers the hidden questions.
