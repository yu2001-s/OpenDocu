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
- deterministic fixture, package install, and real network gates pass
- `npm view opendocu version` still returns 404 or an older published version

## Publish

```bash
npm publish --access public
```

The package contains the CLI, docs, tests, scripts, Codex plugin metadata, Claude Code plugin metadata, and shared OpenDocu skill.

## Positioning

For v1, position OpenDocu as:

> Local-first official documentation memory for coding agents.

Do not claim global hosted coverage parity with Context7. OpenDocu's v1 strength is local reuse, inspectable storage, deterministic search, versioned citations, and agent-verifiable growth.
