# Retrieval Repair

Retrieval repair is the feedback loop for failed or weak searches. Raw official docs remain the knowledge base; semantic cards are targeted patches that help `opendocu search` find those raw docs.

Use retrieval repair only after local raw docs exist and a real query misses or misranks the right evidence.

## Failure Classes

- Docs missing or too thin: fetch more official docs, import them, run `opendocu index`, then search again.
- Feature absent: answer that local OpenDocu has no evidence. Do not create a card unless raw docs explicitly prove absence or non-support.
- Bad search terms: retry with symbols, option names, headings, modules, error codes, or fewer terms.
- Retrieval mismatch: if raw docs contain the answer but the user's wording misses them, create or update a semantic card.
- Ranking noise: if the right raw doc exists but is buried, add minimal aliases/topics/edges that route to the raw doc.

## Repair Workflow

1. Record the original failed search terms.

```bash
opendocu search <library> <failed-keyword...> --version <version>
```

2. Investigate without guessing. Try alternate OpenDocu searches, inspect available docs, or search the stored raw pages directly:

```bash
opendocu search <library> <symbol-or-heading...> --version <version> --json
rg "<symbol|heading|option|error>" ${OPENDOCU_HOME:-~/.opendocu}/libraries/<library>/versions/<version>/pages
```

3. Once a candidate doc is found, read the raw page:

```bash
opendocu get <library@version/path>
```

4. Create a small semantic card only if the raw page contains the evidence. Include the failed wording as aliases or topics, and reference raw source IDs and `source_hashes`.

5. Validate and rebuild:

```bash
opendocu map validate <library> --version <version>
opendocu index
```

6. Replay the original failed search. Keep the card only if `opendocu search` now returns the raw official doc with a semantic routing hint.

## Card Discipline

- Do not create cards from model memory.
- Do not create cards when the raw docs are missing.
- Do not create tiny answer pages to justify a card.
- Do not attempt to build a complete graph over every doc page.
- Keep cards minimal: aliases, topics, source IDs, source hashes, and optional `context_only` edges.
- Treat card text as routing metadata only. Final answers must use `opendocu get` on raw docs.

## Example

If `resume saved scope` fails but `AsyncLocalStorage.snapshot()` exists in the raw Node docs, add a card like:

```md
---
library: "node"
version: "24.16.0"
title: "AsyncLocalStorage snapshot"
kind: "api"
sources: "node@24.16.0/async_context"
source_hashes: "sha256:..."
aliases: "resume saved scope, re-enter captured context, saved async scope"
topics: "async context, context propagation"
---

# AsyncLocalStorage snapshot

Routing card for user wording around re-entering a saved async context. Verify answers from the raw source doc.
```
