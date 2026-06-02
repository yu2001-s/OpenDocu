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

The deterministic release fixture initializes a semantic map for `node@24.16.0`, writes a source-backed `AsyncLocalStorage.snapshot()` API card, validates its `sources` and `source_hashes` against the imported raw docs, rebuilds the index, and confirms ordinary `opendocu search` routes a semantic-only query back to the raw official doc.

The semantic map remains routing metadata. Final answers still verify claims through raw docs with `opendocu get`.
