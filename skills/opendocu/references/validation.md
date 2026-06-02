# Validation

Use high-standard gates to test whether OpenDocu works for agents, not just whether the CLI runs.

## Gate Rules

1. Choose the official docs corpus before choosing niche questions.
2. Import or write a broad docs set into an empty `OPENDOCU_HOME`.
3. Run `opendocu index` and `opendocu doctor`.
4. Ask niche questions whose answers exist somewhere in the source docs.
5. Use only `opendocu search` and `opendocu get` for local retrieval before answering.
6. Require source URL, version, heading, and enough snippet/full-page context to support the answer.
7. Compare against raw filesystem search for agent usefulness, not only latency.
8. When semantic cards are part of the scenario, confirm they are optional retrieval patches: a failed or weak query is repaired only after raw evidence is found, and `opendocu search` returns raw docs with `semantic_matches` routing hints, not semantic-card text as evidence.

## Five-Set Live-Agent Eval

A proper live eval uses at least five independent sets. Each set starts with:

- the plugin path,
- the skill path,
- an empty `OPENDOCU_HOME`,
- permission to fetch official docs.

Use one grower agent per set. The grower sees only the library/version and official-source rule, not the hidden query prompts. After growth, run multiple independent query agents against the grown store. Include easy, niche, version-specific, cross-page, alias/wording, and negative/no-evidence questions across the full eval.

Generate the default five-set protocol with:

```bash
npm run eval:live:plan -- --run-dir .tmp/live-agent-eval/run-001
```

Score completed JSON reports with:

```bash
npm run eval:live:score -- .tmp/live-agent-eval/run-001
```

Do not give expected answers to grower or query agents. The test passes only if agents grow stores from official docs, index them, search OpenDocu, use `opendocu get`, and answer or refuse from cited local results. Negative questions may pass by finding no evidence, or by finding raw docs that explicitly show absence or non-support. Low semantic-card counts are not a failure when raw-doc retrieval works. If semantic cards are used, they must be source-hash validated, activated through `opendocu index`, and justified as retrieval patches rather than answer evidence.

## Failure Signals

- The agent answers from memory or web snippets after adding docs.
- The agent writes a small custom page containing only the expected answer.
- Search returns the right page but wrong version.
- Search cannot find exact API symbols that exist in the source docs.
- The final answer omits source URL or version for a version-sensitive question.
