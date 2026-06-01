# Versioning

Version correctness is part of the product. Treat ambiguous versions as a retrieval risk.

## Version Detection

Prefer project-local evidence:

- JavaScript: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`
- Python: `pyproject.toml`, `requirements.txt`, `uv.lock`, installed package metadata
- Rust: `Cargo.toml`, `Cargo.lock`
- Go: `go.mod`, `go.sum`
- Java/Kotlin: `pom.xml`, `build.gradle`, lockfiles
- .NET: `.csproj`, `packages.lock.json`

If the user states a version, use it. If the project has a different installed version, mention the mismatch before answering.

## Search Rules

Resolve library aliases before searching when names are ambiguous:

```bash
opendocu resolve nodejs
opendocu alias node-runtime node
```

Use `--version` when known. OpenDocu resolves common semver aliases, so a project version like `15.3.2` can match docs stored as `15` when no exact `15.3.2` docs are present:

```bash
opendocu search node AsyncLocalStorage.snapshot context --version 24.16.0
```

If unknown, search without `--version`, inspect returned versions, then narrow. Do not merge results across major versions unless the answer explicitly compares them.

## Storage Rules

Store docs under the exact version identifier used by the source, such as `24.16.0`, `15`, `19.0.0`, or `v14.3.0-canary.87`. Keep source URLs versioned when the upstream source supports it.

For Git sources, prefer immutable tags or commits over moving branches. Record the tag or commit in the URL or page content when possible.
