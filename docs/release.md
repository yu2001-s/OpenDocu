# Release

## Preflight

```bash
npm run gate:release
```

Verify:

- `package.json` version matches `.codex-plugin/plugin.json`
- `package.json` version matches `.claude-plugin/plugin.json`
- `src/constants.mjs` reports the same CLI version
- `CHANGELOG.md` contains the release entry
- deterministic fixture, workflow simulation, package install, and real network gates pass
- workflow simulation includes failure-driven retrieval repair replay
- live-agent eval has a recent five-set pass or documented waiver
- `npm view opendocu version` still returns 404 or an older published version

## Publish

```bash
npm publish --access public
```

The package contains the CLI, docs, tests, scripts, Codex plugin metadata, Claude Code plugin metadata, and shared OpenDocu skill.

## Positioning

For v1, position OpenDocu as:

> Local-first official documentation memory for coding agents.

Do not claim global hosted coverage parity with Context7 or complete semantic-graph coverage. OpenDocu's v1 strength is local reuse, inspectable source docs, deterministic search, versioned citations, agent-verifiable growth, and source-backed retrieval repair.
