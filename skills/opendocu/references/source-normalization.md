# Source Normalization

OpenDocu's generic docs support is an adapter contract, not a built-in crawler for every documentation platform.

The CLI imports local Markdown/MDX and local HTML. The agent can grow any official documentation source by normalizing that source into auditable, source-backed Markdown/MDX pages first, then using the same `opendocu import`, `opendocu index`, `opendocu search`, and `opendocu get` flow.

## Adapter Contract

An official-doc adapter is a repeatable agent workflow for one source shape. It must:

- use only official sources for the requested library and version
- fetch a broad coherent corpus before answering niche questions
- keep the original official URL for every stored page
- preserve declarations, parameters, return values, warnings, examples, availability, version history, and links
- avoid model-written answer summaries as source pages
- keep enough raw source wording that exact symbols, options, and niche terms remain searchable
- run `opendocu index` and inspect at least one `opendocu get` page before answering

If the source format is already Markdown/MDX, import it directly. If it is HTML, use `opendocu import-html` when the conversion preserves the important content. If it is any other official format, normalize it to Markdown/MDX first.

## Universal Flow

1. Identify the library and requested version.
2. Find the official source corpus: release tag, versioned docs URL, docs sitemap, `llms.txt`, package docs link, or official reference data.
3. Pin the version when possible. Prefer tags, release tarballs, immutable docs URLs, or SDK release docs over moving branches.
4. Fetch a broad set of official pages or source records, not only the page that looks relevant to the current question.
5. Normalize each canonical source page or API record into one Markdown/MDX page.
6. Import normalized pages:

```bash
opendocu import <library> <version> <normalized-source-dir> --url-base <official-url-base>
opendocu index
opendocu doctor
```

7. Search with keywords, then read full pages with `opendocu get`.
8. If raw docs contain the answer but a real query misses because of wording, use retrieval repair.

## Source Shapes

Use the same normalized-page contract for all source shapes:

- Repository Markdown/MDX: import the official docs directory for the release tag or commit.
- Static HTML: fetch the official pages and use `opendocu import-html`; inspect complex tables and generated components with `opendocu get`.
- Generated site data: convert official route JSON, search indexes, sidebar data, or page payloads into Markdown pages.
- API reference JSON: convert each operation, class, function, method, type, or property into a page or coherent section.
- API specs: convert OpenAPI, AsyncAPI, GraphQL schema, protobuf, JSON Schema, or similar official specs into operation/type pages.
- Language-native docs: convert official rustdoc, Go package docs, Javadoc/KDoc, .NET API docs, or manpage/reference output into pages that preserve member names and signatures.
- Sparse package docs: import the official README plus official changelog, migration guide, API reference, and examples when available.

Do not add a product-specific search path for each format. The search path stays `opendocu search`; format-specific work happens only before import.

## Normalized Page Shape

Each normalized page should have frontmatter like:

```md
---
library: "widgetkit"
version: "2.4.0"
title: "Widget.render(options)"
url: "https://docs.example.com/widgetkit/2.4/reference/widget-render"
retrieved_at: "2026-06-02T00:00:00Z"
content_hash: "sha256:..."
source_format: "structured-json"
source_adapter: "official-doc-normalization"
source_identifier: "widgetkit.Widget.render"
---
```

If you pass normalized pages through `opendocu import`, the importer computes the stored `content_hash`. Keep `source_format`, `source_adapter`, and `source_identifier` in frontmatter so provenance remains visible after import.

The body should preserve source material in Markdown:

````md
# Widget.render(options)

Source: https://docs.example.com/widgetkit/2.4/reference/widget-render
Identifier: widgetkit.Widget.render

## Signature

```ts
Widget.render(options: RenderOptions): RenderHandle
```

## Parameters

| Name | Description |
| --- | --- |
| `options.hydration` | Controls whether hydration runs on the client or server. |

## Version Notes

Added in 2.4.0.
````

Prefer source wording. It is fine to flatten structured records into headings, lists, and tables, but do not invent claims or omit caveats because they look irrelevant.

## Quality Checks

After growth, check all of these before treating the store as ready:

```bash
opendocu index
opendocu doctor
opendocu search <library> <exact-symbol-or-option> --version <version>
opendocu search <library> <niche-parameter-or-version-term> --version <version>
opendocu get <library@version/path>
```

Also run at least one negative search for a feature that should not be present in the imported corpus. A no-result answer is correct only when local raw docs lack evidence or explicitly say the feature is unsupported.

## Failure Handling

- If many pages are navigation-only, fix the fetch or conversion before answering.
- If source URLs are missing, fix normalization before indexing.
- If a generated page loses parameter tables, code blocks, anchors, or version notes, write a better normalizer for that source shape.
- If search fails but `opendocu get` confirms the answer exists, add a source-backed semantic card as retrieval repair.
- If the docs source cannot be pinned to the requested version, say exactly what version or retrieval date was imported.
