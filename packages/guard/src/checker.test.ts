import assert from "node:assert/strict";
import { test } from "node:test";
import { checkChange, checkContent, moduleMatches } from "./checker.js";
import { DEFAULT_EXCLUDE, parseRule } from "./config.js";
import type { GuardConfig, Rule } from "./types.js";

function config(rules: unknown[], aliases: Record<string, string> = {}): GuardConfig {
  const parsed = rules.map((r) => {
    const rule = parseRule(r, "test.yaml");
    if (typeof rule === "string") throw new Error(rule);
    return rule;
  });
  return { root: "/project", rules: parsed as Rule[], exclude: DEFAULT_EXCLUDE, aliases, errors: [] };
}

const cfg = config(
  [
    { id: "no-axios", type: "forbid-import", paths: ["src/core/payment/**"], modules: ["axios"] },
    { id: "ui-db", type: "boundary", from: ["src/ui/**"], to: ["src/db/**"] },
    { id: "no-log", type: "forbid-pattern", paths: ["src/**"], pattern: "console\\.log\\(", severity: "warn" },
    { id: "frozen", type: "protected", paths: ["migrations/**"] },
  ],
  { "@/": "src/" },
);

test("module matching covers subpaths and globs, not prefixes of other names", () => {
  assert.ok(moduleMatches("axios", "axios"));
  assert.ok(moduleMatches("axios/lib/core", "axios"));
  assert.ok(!moduleMatches("axios-retry", "axios"));
  assert.ok(moduleMatches("@aws-sdk/client-s3", "@aws-sdk/*"));
});

test("forbid-import only applies inside its paths", () => {
  const code = `import axios from "axios";\n`;
  assert.equal(checkContent(cfg, "src/core/payment/pay.ts", code)[0]?.ruleId, "no-axios");
  assert.equal(checkContent(cfg, "src/other/pay.ts", code).length, 0);
});

test("boundary catches relative and aliased imports", () => {
  const rel = checkContent(cfg, "src/ui/Page.tsx", `import { q } from "../db/query";`);
  const alias = checkContent(cfg, "src/ui/Page.tsx", `import { q } from "@/db/query";`);
  const ok = checkContent(cfg, "src/ui/Page.tsx", `import { s } from "../services/user";`);
  assert.deepEqual([rel.length, alias.length, ok.length], [1, 1, 0]);
  assert.equal(rel[0].line, 1);
});

test("forbid-pattern reports each match with its line and severity", () => {
  const v = checkContent(cfg, "src/a.ts", `const a = 1;\nconsole.log(a);\nconsole.log(2);`);
  assert.deepEqual(
    v.map((x) => [x.ruleId, x.line, x.severity]),
    [
      ["no-log", 2, "warn"],
      ["no-log", 3, "warn"],
    ],
  );
});

test("checkChange reports only violations introduced by the change", () => {
  const before = `import axios from "axios";\nexport const a = 1;\n`;
  const sameViolation = `import axios from "axios";\nexport const a = 2;\n`;
  const newViolation = `${before}import axios2 from "axios/lib/x";\n`;
  assert.equal(checkChange(cfg, "src/core/payment/pay.ts", before, sameViolation).length, 0);
  assert.equal(checkChange(cfg, "src/core/payment/pay.ts", before, newViolation).length, 1);
});

test("protected rules block changes to existing files but allow new files", () => {
  const v = checkChange(cfg, "migrations/001_init.sql", "create table a;", "drop table a;");
  assert.deepEqual(
    v.map((x) => x.ruleId),
    ["frozen"],
  );
  assert.deepEqual(checkChange(cfg, "migrations/002_next.sql", null, "alter table a;"), []);
});

test("parseRule rejects invalid rules with a clear message", () => {
  assert.match(String(parseRule({ id: "x", type: "nope" }, "f")), /"type" must be one of/);
  assert.match(String(parseRule({ id: "x", type: "boundary", from: ["a/**"] }, "f")), /"from" and "to" are required/);
  assert.match(String(parseRule({ id: "x", type: "forbid-pattern", pattern: "(" }, "f")), /invalid pattern/);
});
