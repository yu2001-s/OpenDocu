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

## Independent Agent Forward Test

A proper forward test starts a fresh agent with only:

- the plugin path,
- the skill path,
- an empty `OPENDOCU_HOME`,
- a user question,
- permission to fetch official docs.

Do not give the expected answer. The test passes only if the agent grows the store from official docs, indexes it, searches OpenDocu, and answers from cited local results.

## Failure Signals

- The agent answers from memory or web snippets after adding docs.
- The agent writes a small custom page containing only the expected answer.
- Search returns the right page but wrong version.
- Search cannot find exact API symbols that exist in the source docs.
- The final answer omits source URL or version for a version-sensitive question.
