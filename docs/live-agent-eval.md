# Live-Agent Eval

Live-agent evals test the part deterministic gates cannot test: whether agents naturally grow a useful OpenDocu knowledgebase from official docs and answer from local evidence.

This is a manual release diagnostic, not CI. Keep it separate from `npm run gate:release`.

## Generate A Run

```bash
npm run eval:live:plan -- --run-dir .tmp/live-agent-eval/run-001
```

The command writes:

- `prompts/<scenario>/grower.md`
- `prompts/<scenario>/queries/*.md`
- `reports/<scenario>/*.json`
- `stores/<scenario>/`
- hidden evaluator answer keys under `evaluator/answer-keys/`

Do not show query prompts or answer keys to grower agents.

## Scenario Sets

The default plan has five blind sets:

| Set | Docs shape | Purpose |
| --- | --- | --- |
| `node-24` | excellent versioned Markdown API docs | symbols, options, niche APIs, negative cross-library query |
| `react-19` | excellent framework docs with changed concepts | version changes, aliases, missing hooks |
| `nextjs-15` | version-sensitive framework docs | route config, middleware, cache/version boundary |
| `python-313` | large official HTML stdlib docs | HTML growth, version-specific stdlib additions |
| `p-map-7` | README-centric package docs | sparse package docs and negative missing feature |

Each set has one grower agent and five query agents.

## Run Order

1. Spawn one grower agent with only `prompts/<scenario>/grower.md`.
2. Wait for the grower to write `reports/<scenario>/grower.json`.
3. Run `opendocu doctor` on the scenario store if the grower did not already include it.
4. Spawn independent query agents with `prompts/<scenario>/queries/*.md`.
5. Wait for every query agent to write its JSON report.
6. Score the run:

```bash
npm run eval:live:score -- .tmp/live-agent-eval/run-001
```

Use `-- --json` after the run directory for a machine-readable report:

```bash
npm run eval:live:score -- .tmp/live-agent-eval/run-001 --json
```

## Grower Pass Criteria

The grower should:

- use only official docs matching the requested library and version
- import a broad coherent docs corpus, not targeted answer pages
- normalize generated or structured official docs into source-backed Markdown/MDX when direct import would lose important content
- preserve source URLs and version metadata
- run `opendocu index`
- run `opendocu doctor`
- treat raw official docs as the knowledge base
- create semantic cards only as optional retrieval patches, not as a complete graph
- validate semantic cards and re-index when cards exist

## Query Pass Criteria

Each query agent should:

- choose concise keywords/symbols/options instead of passing the full question to search
- pass the requested version
- use `opendocu search`
- use `opendocu get` before answering positive questions
- cite raw official docs, not semantic-card text
- refuse or caveat when local evidence is missing
- answer negative questions from raw contrary evidence when docs explicitly show absence or non-support
- avoid mixing libraries or versions

## Failure Signals

- Grower imports blog posts, Stack Overflow, generated summaries, or non-official docs.
- Grower writes small custom pages tailored to hidden questions.
- Grower imports the wrong version or mixes versions.
- Grower answers directly from fetched generated data instead of normalizing, importing, indexing, searching, and using `opendocu get`.
- Query agent answers from memory after a weak or empty search.
- Query agent uses semantic-card text as answer authority.
- Agent treats semantic-card count or graph coverage as more important than raw-doc retrieval success.
- Negative query receives a confident answer despite no local evidence.
- Agent finds a relevant page but skips `opendocu get`.

## Interpreting Scores

The scorer checks report mechanics and obvious evidence failures. It is not a substitute for human review. Review transcripts manually for:

- whether the imported corpus is broad enough
- whether semantic cards, if present, improve routing without inventing claims
- whether raw-doc search succeeds even with few or no semantic cards
- whether answers are nuanced and supported by the cited raw docs
- whether the agent got a correct answer by luck after weak retrieval

Treat failures as skill or CLI design feedback. Tighten prompts, validation rules, or commands when multiple agents fail the same way.
