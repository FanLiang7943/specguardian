# 🛡️ SpecGuardian

**English** | [简体中文](./README.zh-CN.md)

> AI writes code fast. SpecGuardian makes sure it still follows your architecture.

Your specs say *"UI code must not touch the database"* or *"payment code must not use axios"*. Three prompts later, the agent forgets. Tools like [Spec Kit](https://github.com/github/spec-kit) and [OpenSpec](https://github.com/Fission-AI/OpenSpec) help you write specs. **SpecGuardian enforces the hard rules in those specs every time an agent edits a file.**

- **Blocks at edit time.** A `PreToolUse` hook checks every write before it reaches disk and tells the agent which rule it broke and how to fix it.
- **Rules live in your specs.** Declare rules in fenced ` ```specguardian ` blocks inside your existing spec markdown, or in `.specguardian/guard.yaml`.
- **Deterministic and fast.** No LLM calls, no API keys. Plain static checks that take milliseconds.
- **Brownfield-friendly.** Edits are blocked only for violations they *introduce*. Existing violations don't block unrelated work.
- **Works with your agent.** Hooks for Claude Code and Cursor, an MCP server for any MCP client, and a CLI for CI.

```
 Agent wants to edit src/ui/Page.tsx
            │
            ▼
 ┌───────────────────────────┐   rules from .specguardian/guard.yaml
 │ PreToolUse hook           │ ◄─ and ```specguardian blocks in your specs
 │ specguardian-guard hook   │
 └───────────┬───────────────┘
     ok      │      violation
   ┌─────────┴─────────┐
   ▼                   ▼
 edit runs      edit is denied. The agent sees:
                "[no-direct-db-in-ui] src/ui/Page.tsx:3 imports
                 "../db/client" across a boundary. UI code must
                 go through the service layer."
```

## Quick start

Requires Node.js 20+.

```bash
# 1. In your project root, create .specguardian/guard.yaml
npx -y @liangf7943/specguardian-guard init

# 2. Edit the example rules in .specguardian/guard.yaml

# 3. Register the hook, the MCP server and the agent skill
npx -y @liangf7943/specguardian-guard install --claude     # Claude Code
npx -y @liangf7943/specguardian-guard install --cursor     # Cursor

# 4. See where the code already drifts from the rules
npx -y @liangf7943/specguardian-guard check
```

`install` writes these files (commit them so your team gets the same guard):

| Agent | Files |
|---|---|
| Claude Code | `.claude/settings.json` (PreToolUse hook), `.mcp.json`, `.claude/skills/specguardian-guard/SKILL.md` |
| Cursor | `.cursor/hooks.json` (preToolUse hook), `.cursor/mcp.json`, `.cursor/skills/specguardian-guard/SKILL.md` (skipped when the Claude skill exists, because Cursor also loads `.claude/skills/`) |

By default, hooks run `npx -y @liangf7943/specguardian-guard`. For faster hooks, add the package as a dev dependency and point `install` at it:

```bash
npm install -D @liangf7943/specguardian-guard
npx specguardian-guard install --claude --command "node ./node_modules/@liangf7943/specguardian-guard/dist/cli.js"
```

## Declaring rules inside your specs

Put rules next to the requirement they come from. SpecGuardian scans the markdown files listed under `sources` in `guard.yaml`. `init` detects OpenSpec, Spec Kit and Kiro layouts automatically.

````markdown
## Payments

Payment code must use the internal HTTP client so retries and audit logging stay consistent.

```specguardian
id: payment-no-axios
type: forbid-import
paths: ["src/core/payment/**"]
modules: ["axios", "node-fetch"]
message: Use src/lib/http instead.
```
````

A block may contain one rule, a list of rules, or `rules: [...]`. Violations report where each rule came from, so the agent and the reviewer can trace them back to the spec.

## Rule reference

Common fields:

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique rule id, shown in every report |
| `type` | yes | `forbid-import`, `boundary`, `protected` or `forbid-pattern` |
| `paths` | no | Globs of files the rule applies to (default: all files). `boundary` uses `from` instead |
| `exclude` | no | Globs to skip |
| `severity` | no | `error` (default, blocks the edit) or `warn` (reported to the agent, does not block) |
| `message` | no | Why the rule exists and what to do instead. Shown to the agent |

Rule types:

| Type | Extra fields | Fails when |
|---|---|---|
| `forbid-import` | `modules`: module names or globs | A file in `paths` imports one of `modules`. `axios` also matches `axios/lib/x`, but not `axios-retry` |
| `boundary` | `from`, `to`: path globs | A file in `from` imports a file in `to`. Resolves relative imports, `aliases` and Python dotted imports |
| `protected` | — | An agent edits a file in `paths` (hooks only) |
| `forbid-pattern` | `pattern`: regex, `flags` (optional) | A file in `paths` contains text that matches `pattern` |

Import detection covers JavaScript/TypeScript (`.js .jsx .ts .tsx .mjs .cjs .mts .cts .vue .svelte .astro`) and Python (`.py .pyi`). `forbid-pattern` and `protected` work on any text file.

## Configuration

`.specguardian/guard.yaml`:

```yaml
version: 1

# Markdown files scanned for ```specguardian blocks
sources:
  - openspec/specs/**/*.md
  - .specify/memory/*.md

# Extra paths to ignore (.git, node_modules, dist, build, coverage, .next, .venv are ignored by default)
exclude: ["generated/**"]

# Import prefix rewrites for boundary rules (e.g. tsconfig "paths")
aliases:
  "@/": "src/"

rules:
  - id: no-direct-db-in-ui
    type: boundary
    from: ["src/ui/**"]
    to: ["src/db/**"]
    message: UI code must go through the service layer.

  - id: frozen-migrations
    type: protected
    paths: ["migrations/**"]
    message: Applied migrations are immutable. Add a new migration instead.

  - id: no-console-log
    type: forbid-pattern
    paths: ["src/**"]
    pattern: "console\\.log\\("
    severity: warn
```

Invalid rules are skipped and reported. They never break the agent's session.

## CLI

| Command | Description |
|---|---|
| `specguardian-guard init [--force]` | Create `.specguardian/guard.yaml` |
| `specguardian-guard install [--claude] [--cursor] [--command "<cmd>"]` | Register hooks, the MCP server and the skill (default: `--claude`) |
| `specguardian-guard check [files...] [--json]` | Scan for violations. Exits 1 when errors are found |
| `specguardian-guard rules [file]` | List all rules, or only the rules that apply to a file |
| `specguardian-guard hook <claude\|cursor>` | Hook entry point. Reads the hook JSON on stdin |
| `specguardian-guard mcp` | Start the MCP server on stdio |

## MCP tools

| Tool | Description |
|---|---|
| `guard_list_rules` | List rules, optionally only those that apply to a file. Agents call it before editing an unfamiliar area |
| `guard_check_file` | Check a file on disk, or proposed content (only new violations are reported) |
| `guard_check_drift` | Scan the whole project, or a list of files |

The MCP server finds the project by walking up from its working directory, or from `SPECGUARDIAN_ROOT` if set.

## Agent support

| Agent | Blocking at edit time | MCP tools | Notes |
|---|---|---|---|
| Claude Code | ✅ `PreToolUse` on `Write\|Edit\|MultiEdit` | ✅ | Warnings are passed to the agent as additional context |
| Cursor | ✅ `preToolUse` on `Write` (experimental) | ✅ | Cursor can also load Claude Code hooks. If you enable that, install only one target so files aren't checked twice |
| Other MCP clients | — | ✅ | Use the MCP tools and run `check` in CI |

## Use in CI

```yaml
# .github/workflows/specguardian.yml
name: SpecGuardian
on: [pull_request]
jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx -y @liangf7943/specguardian-guard check
```

## Limitations

- Import detection is pattern-based, not a full parser. It handles static, dynamic and `require` imports, and ignores comments.
- Hooks only see file-editing tools. Files written through shell commands are not intercepted, so run `check` in CI as a backstop.
- `boundary` rules don't read `tsconfig.json`. Declare path aliases under `aliases`.

## Repository layout

```
packages/
  core/    @liangf7943/specguardian-core: shared glob, path and file helpers
  guard/   @liangf7943/specguardian-guard: rules engine, hooks, MCP server, CLI, agent skill
```

Development:

```bash
npm install
npm test        # builds all packages and runs the tests
```

## Roadmap

- `@liangf7943/specguardian-router`: sorts each request by size and only interrupts you for large changes
- Parser-based (tree-sitter) import detection and more languages
- `require-pattern` and dependency-direction rules

## License

[MIT](./LICENSE)
