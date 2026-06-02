# Launch Readiness

OpenDocu v1 is launchable when these checks pass:

- `npm run gate:release`
- CI is green on Node.js 24
- five-set blind live-agent eval succeeds from empty stores, or has a documented waiver
- README and install docs describe the deterministic CLI/agent boundary
- Codex, Claude Code, and generic agent adapters describe the same CLI contract
- security notes explain that imported docs are untrusted reference material

Current v1 coverage:

- Markdown/MDX official docs import
- HTML official docs import
- version-aware search
- stale index protection
- scoped package IDs
- local aliases and resolver
- source-hash validated semantic map for failure-driven retrieval routing
- Codex skill with progressive references
- Claude Code plugin manifest and manual search command
- generic `AGENTS.md` instructions for other shell-capable agents
- real Node.js Markdown gate
- real Node.js HTML gate
- deterministic 10-library fixture gate
- deterministic scripted grow/search/get workflow gate
- deterministic retrieval-repair replay inside the workflow gate
- manual five-set live-agent eval harness
- packaged npm tarball install smoke

Known non-goals for v1:

- hosted global docs corpus
- MCP server
- hidden network fetches in the CLI
- LLM summarization inside the CLI
