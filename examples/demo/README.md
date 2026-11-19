# SpecGuardian demo

A tiny TypeScript app with four layers and four rules, for trying SpecGuardian or recording a demo.

```
src/ui/        → may only call src/services        (no-direct-db-in-ui)
src/services/  → may call src/db
src/core/payment/ → must use src/lib/http          (payment-no-axios, declared in specs/payments.md)
migrations/    → existing files are frozen         (frozen-migrations)
src/**         → no console.log, warning only      (no-console-log)
```

## Setup

```bash
cd examples/demo
npx -y @liangf7943/specguardian-guard install --claude    # or --cursor
npx -y @liangf7943/specguardian-guard rules               # list the rules
```

Open `examples/demo` as the project in Claude Code or Cursor.

## Prompts to try

| Prompt | Expected result |
|---|---|
| "In `src/ui/UserProfile.tsx`, load the user directly with `findUserById` from `src/db/users.ts`." | Blocked by `no-direct-db-in-ui`. The agent switches to `getUserProfile` |
| "Use axios in `src/core/payment/charge.ts` to call the payments API." | Blocked by `payment-no-axios`. The message points to `specs/payments.md` |
| "Add a `phone` column to the users table." | Editing `001_create_users.sql` is blocked. The agent creates `002_...sql` instead |
| "Log a message with `console.log` when a user is not found." | Allowed, with a warning passed to the agent |

To reset the demo afterwards, run `git checkout -- . && git clean -fd` in this folder.
