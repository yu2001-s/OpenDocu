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
npm run gate:real
```

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
