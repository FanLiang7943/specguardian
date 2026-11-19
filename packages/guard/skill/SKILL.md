---
name: specguardian-guard
description: Respect the hard architecture rules declared in this project's specs (SpecGuardian). Use before editing code, when an edit is blocked by SpecGuardian, or when the user asks whether the code still follows the spec.
---

# SpecGuardian guard

This project declares hard rules in `.specguardian/guard.yaml` and in fenced ` ```specguardian ` blocks inside its spec files. A hook checks every file edit against these rules and blocks edits that break them.

## Before editing

- When working in an unfamiliar area, call the `guard_list_rules` MCP tool with the file path to see which rules apply.
- Plan the change so it respects those rules from the start.

## When an edit is blocked

The block message names the rule, the file and line, and where the rule was declared.

1. Rewrite the change so it complies. For example, go through the allowed layer instead of importing across a boundary.
2. If the rule seems wrong or outdated for this task, stop and ask the user. Quote the rule id and its source file. Never edit `.specguardian/guard.yaml` or spec rule blocks to get past a block unless the user explicitly asks for it.
3. Do not work around the guard, for example by writing the file through a shell command.

## Checking drift

- `guard_check_file` checks one file, or proposed content for it.
- `guard_check_drift` scans the whole project. Use it after larger refactors and report the result to the user.

Warnings (severity `warn`) do not block edits. Mention them to the user when they are relevant.
