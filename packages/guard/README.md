# @liangf7943/specguardian-guard

> AI writes code fast. SpecGuardian makes sure it still follows your architecture.

SpecGuardian enforces the hard rules in your specs every time an AI coding agent edits a file. A `PreToolUse` hook checks each write before it reaches disk, and tells the agent which rule it broke and how to fix it.

- Rules live in your specs (fenced ` ```specguardian ` blocks) or in `.specguardian/guard.yaml`
- Deterministic static checks: no LLM calls, no API keys
- Only blocks violations an edit *introduces*, so existing projects can adopt it right away
- Hooks for Claude Code and Cursor, an MCP server, and a CLI for CI

## Quick start

```bash
npx -y @liangf7943/specguardian-guard init               # create .specguardian/guard.yaml
npx -y @liangf7943/specguardian-guard install --claude   # or --cursor
npx -y @liangf7943/specguardian-guard check              # scan for existing drift
```

Example rule inside a spec:

````markdown
```specguardian
id: no-direct-db-in-ui
type: boundary
from: ["src/ui/**"]
to: ["src/db/**"]
message: UI code must go through the service layer.
```
````

Rule types: `forbid-import`, `boundary`, `protected`, `forbid-pattern`.

## Documentation

Full documentation, rule reference and configuration: **[github.com/FanLiang7943/specguardian](https://github.com/FanLiang7943/specguardian#readme)** ([简体中文](https://github.com/FanLiang7943/specguardian/blob/main/README.zh-CN.md))

## License

MIT
