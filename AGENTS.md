# Project workflow

- Every feature requires an OpenSpec change before implementation. Keep read-only analytical scope; no signing, custody or fund movement.
- Graphify is installed in `.tools/graphify` (graphifyy 0.9.67). Before reading several source files, query the local graph with `./scripts/graphify.ps1 query "symbol or question" --budget 800`; then verify relevant source code. A graph is navigation context, not proof of runtime behavior.
- Refresh after source changes with `./scripts/graphify.ps1 extract . --code-only --no-cluster --max-workers 1`. Only `src/` is indexed via `.graphifyignore`. Do not run semantic extraction, model APIs, watchers or global hooks for this workflow.
- The project MCP configuration enables read-only Graphify query tools. If the host has not loaded them, use the CLI wrapper in the current session and state that limitation.
- Run `npm run check` and strict OpenSpec validation for changes. Record skipped/platform-specific tests honestly.
