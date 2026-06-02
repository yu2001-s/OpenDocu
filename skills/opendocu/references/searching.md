# Searching

Use OpenDocu search as the first retrieval step for framework, library, SDK, runtime, and tool docs.

## Command Shape

```bash
opendocu search <library> <keyword...> --version <version>
opendocu search <library> <keyword...> --version <version> --json
opendocu get <library@version/path>
opendocu get --library <name> --version <version> --path <path>
```

The CLI is keyword-first. Convert the user's request into terms the official docs are likely to contain.
Search defaults to `--match auto`: it tries all keywords first, then falls back to any keyword only if strict matching is empty.
When valid semantic cards are active, `opendocu search` may use their aliases, topics, and relationships to route results. The returned results are still raw official doc chunks.

Use `opendocu resolve <library>` before searching if the name could be an alias. Use `opendocu alias <alias> <library>` when a local store uses a canonical name but the project uses another name.

Good:

```bash
opendocu search nextjs middleware cookies NextResponse --version 15
opendocu search react useTransition Actions pending --version 19
opendocu search node AsyncLocalStorage.snapshot context --version 24.16.0
opendocu search node diagnostics_channel tracingChannel hasSubscribers --version 24.16.0
opendocu search node --version 24.16.0 -- --watch
```

Use `--` before search keywords that begin with `--` when they could be confused with OpenDocu flags, such as `--version`.

Bad:

```bash
opendocu search nextjs "how do I set cookies in middleware?"
```

## Retry Ladder

1. Search exact API symbols or option names first.
2. If empty, split symbols into parts: `AsyncLocalStorage.snapshot` -> `AsyncLocalStorage snapshot context`.
3. If still empty, search headings or module names: `async_context`, `middleware`, `NextResponse`.
4. If strict matching is too narrow, retry with fewer terms or use `--match any` intentionally.
5. If there are many plausible results, use `--json` and inspect `heading_path`, `url`, `version`, `snippet`, and any `semantic_matches` routing hints.

## Result Discipline

Prefer results that match the requested version, official source URL, and exact API section heading. Treat `semantic_matches` as routing hints only. Use `opendocu get` for full context before generating code when the snippet omits caveats, stability notes, version history, parameters, or return values.

For scoped or slashed packages, prefer structured `get` flags instead of typing encoded result IDs:

```bash
opendocu get --library "@supabase/supabase-js" --version 2 --path reference/client
```
