import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { handleClaudePreToolUse, handleCursorPreToolUse } from "./hooks.js";
import { makeProject } from "./project.fixture.js";

const GUARD = [
  "version: 1",
  "rules:",
  "  - id: ui-db",
  "    type: boundary",
  "    from: ['src/ui/**']",
  "    to: ['src/db/**']",
  "    message: Go through the service layer.",
  "  - id: no-log",
  "    type: forbid-pattern",
  "    paths: ['src/**']",
  "    pattern: 'console\\.log\\('",
  "    severity: warn",
].join("\n");

function project() {
  return makeProject({
    ".specguardian/guard.yaml": GUARD,
    "src/ui/Page.tsx": `import { getUser } from "../services/user";\nexport const Page = () => null;\n`,
  });
}

const env = {} as NodeJS.ProcessEnv;

test("Claude: denies an Edit that crosses a boundary", () => {
  const root = project();
  const out = handleClaudePreToolUse(
    {
      cwd: root,
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(root, "src", "ui", "Page.tsx"),
        old_string: `import { getUser } from "../services/user";`,
        new_string: `import { query } from "../db/query";`,
      },
    },
    env,
  );
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /\[ui-db\] src\/ui\/Page\.tsx:1/);
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /Go through the service layer/);
});

test("Claude: warnings add context without blocking", () => {
  const root = project();
  const out = handleClaudePreToolUse(
    { cwd: root, tool_name: "Write", tool_input: { file_path: path.join(root, "src", "a.ts"), content: "console.log(1);\n" } },
    env,
  );
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, undefined);
  assert.match(parsed.hookSpecificOutput.additionalContext, /\[no-log\]/);
});

test("Claude: compliant edits and files outside a guarded project produce no output", () => {
  const root = project();
  const ok = handleClaudePreToolUse(
    { cwd: root, tool_name: "Write", tool_input: { file_path: path.join(root, "src", "ui", "New.tsx"), content: "export {};\n" } },
    env,
  );
  const outside = handleClaudePreToolUse(
    { cwd: root, tool_name: "Write", tool_input: { file_path: path.join(makeProject({}), "x.ts"), content: "console.log(1)" } },
    env,
  );
  assert.deepEqual([ok.stdout, outside.stdout], ["", ""]);
});

test("Cursor: always answers with JSON and denies violating writes", () => {
  const root = project();
  const deny = JSON.parse(
    handleCursorPreToolUse(
      {
        workspace_roots: [root],
        tool_name: "Write",
        tool_input: { file_path: "src/ui/Other.tsx", content: `import db from "../db";\n` },
      },
      env,
    ).stdout,
  );
  const allow = JSON.parse(handleCursorPreToolUse({ workspace_roots: [root], tool_name: "Write", tool_input: {} }, env).stdout);
  assert.equal(deny.permission, "deny");
  assert.match(deny.agent_message, /ui-db/);
  assert.equal(allow.permission, "allow");
});
