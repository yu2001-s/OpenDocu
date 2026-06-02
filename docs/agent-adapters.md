# Agent Adapters

OpenDocu's stable interface is the deterministic CLI. Agent support is provided by thin instruction wrappers that teach each agent when to call the CLI, how to choose keywords, how to grow the local store from official docs, and how to respect versions.

## Supported Adapters

| Agent surface | Status | Files |
| --- | --- | --- |
| Codex | Native plugin | `.codex-plugin/plugin.json`, `skills/opendocu/SKILL.md` |
| Claude Code | Native plugin | `.claude-plugin/plugin.json`, `skills/opendocu/SKILL.md`, `commands/search.md` |
| Other shell-capable agents | Generic instructions | `AGENTS.md`, `README.md` |

## Adapter Contract

Adapters must not add hidden fetching, LLM summarization, or MCP behavior to the CLI. They may only instruct the agent to:

- resolve the target library and version
- search with explicit keywords
- fetch official docs outside the CLI when local docs are missing
- import local Markdown/MDX or HTML docs
- repair retrieval with source-backed semantic map cards when raw docs exist but search needs aliases, topics, or relationships
- rebuild the local index
- answer from retrieved local evidence

## Claude Code

Claude Code discovers plugin skills from `skills/` and uses `.claude-plugin/plugin.json` as the plugin manifest. During local development, test with:

```bash
claude --plugin-dir .
```

The main skill is available as:

```text
/opendocu:opendocu
```

The manual search command is available as:

```text
/opendocu:search <library> <keyword...> [--version <version>]
```

If `opendocu` is not on PATH inside Claude Code, the skill and command should use the bundled CLI:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/opendocu.mjs"
```

## Other Agents

For agents without a native plugin format, point the agent at `AGENTS.md` and make sure it can run shell commands. The agent should call the same CLI commands and follow the same search/version rules as the Codex and Claude adapters.
