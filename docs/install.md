# Install

## Requirements

- Node.js `24` or newer
- A local docs source fetched by the user or agent

## CLI

After publishing:

```bash
npm install -g opendocu
opendocu --help
```

From a checkout:

```bash
npm install
node bin/opendocu.mjs --help
```

## Store Location

Default:

```text
~/.opendocu
```

Override per command:

```bash
opendocu search node AsyncLocalStorage.snapshot --store /path/to/store
```

Or per shell:

```bash
export OPENDOCU_HOME=/path/to/store
```

## Codex Plugin

This repository includes a Codex plugin manifest at `.codex-plugin/plugin.json` and the OpenDocu skill under `skills/opendocu`.

Use the repository as a local plugin during development. The skill expects the `opendocu` CLI to be available on PATH, or commands can be run through `node bin/opendocu.mjs` from the checkout.

## Claude Code Plugin

This repository includes a Claude Code plugin manifest at `.claude-plugin/plugin.json`. The plugin uses the same OpenDocu skill under `skills/opendocu` and adds a manual search command at `commands/search.md`.

During development, load the plugin from the checkout:

```bash
claude --plugin-dir .
```

Claude Code exposes the main skill as `/opendocu:opendocu` and the search command as `/opendocu:search`.

If the global `opendocu` command is not installed, the Claude adapter can run the bundled CLI with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/opendocu.mjs"
```

## Other Agents

For shell-capable agents without native OpenDocu packaging, point the agent at `AGENTS.md` and ensure it can run `opendocu` or `node bin/opendocu.mjs`.

## Semantic Map

After importing raw official docs, agents can maintain semantic cards for aliases, topics, and relationships. Rebuild the index so ordinary search can use them:

```bash
opendocu map init node 24.16.0
opendocu map validate node --version 24.16.0
opendocu index
opendocu search node AsyncLocalStorage snapshot --version 24.16.0
```

Semantic cards are stored next to the raw docs under `libraries/<library>/versions/<version>/map/` and must validate back to raw source doc IDs and hashes. They are not answer evidence; use `opendocu get` on raw docs before answering.
