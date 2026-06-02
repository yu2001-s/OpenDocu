# Semantic Map

Use the semantic map after raw official docs have been imported. Semantic cards make `opendocu search` better by recording aliases, topics, simple same-version links, and source-backed retrieval patches. They are routing metadata, not answer evidence.

Raw official docs under `pages/` remain the source of truth. Every semantic card must link back to raw OpenDocu doc IDs and source hashes.

There is one search command: `opendocu search`. There is one indexing command: `opendocu index`. Map commands initialize, validate, and list cards; they do not replace search or indexing.

Do not attempt to mirror every original doc page in the semantic map. Raw docs are sufficient for correctness; cards are added when they fix a concrete retrieval problem or a clearly recurring alias/concept gap.

## Workflow

1. Grow raw official docs first:

```bash
opendocu import <library> <version> <source-dir> --url-base <official-url-base>
opendocu index
```

2. Initialize the semantic map directory:

```bash
opendocu map init <library> <version>
```

This creates `map/README.md` and `map/log.md`.

3. Write semantic cards under:

```text
${OPENDOCU_HOME:-~/.opendocu}/libraries/<library>/versions/<version>/map/
```

4. Validate cards:

```bash
opendocu map validate <library> --version <version>
```

5. Rebuild the index so normal search can use valid cards:

```bash
opendocu index
opendocu search <library> <keyword...> --version <version>
opendocu get <source-doc-id>
```

Before final answers, read raw docs with `opendocu get`; do not cite semantic cards as authoritative.

For retrieval repair, replay the original failed search after indexing. Keep the card only if search now returns the raw source doc with a semantic routing hint.

## Card Schema

```md
---
library: "react"
version: "19"
title: "Actions in transitions"
kind: "concept"
sources: "react@19/reference/use-transition"
source_hashes: "sha256:..."
aliases: "transition action, startTransition action"
topics: "concurrent rendering, non-blocking updates"
edges: "react@19/reference/use-transition#useTransition|related_api|context_only"
---

# Actions in transitions

Brief retrieval patch for aliases and topics. Verify answers from the raw source docs.
```

Rules:

- `sources` is a comma-separated list of raw OpenDocu doc IDs.
- `source_hashes` must match source docs' `content_hash` frontmatter in the same order.
- `aliases` are user phrases, common names, failed-search terms, or error vocabulary that raw docs may not contain.
- `topics` are stable concepts that help retrieval.
- Level 1 edges should stay in the same library and version. They default to `related_api|context_only`.
- Cross-version or cross-library edges must declare a relationship and use `context_only` or `version_contrast`.
- Invalid or stale cards are excluded from `opendocu search`; they do not become answer evidence.
- A card is not required for every API or page. Prefer no card over a stale or unsupported card.

## Health Checks

Run `opendocu map validate` after card edits, then `opendocu index`. `opendocu doctor` reports active and invalid/excluded semantic cards.
