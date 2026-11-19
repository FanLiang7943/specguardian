import assert from "node:assert/strict";
import { test } from "node:test";
import { checkProject } from "./checker.js";
import { loadConfig } from "./config.js";
import { extractRuleBlocks } from "./markdown.js";
import { makeProject } from "./project.fixture.js";

const SPEC = `# Payment spec

Payments must not call third-party HTTP clients directly.

\`\`\`specguardian
id: payment-no-axios
type: forbid-import
paths: ["src/core/payment/**"]
modules: [axios]
message: Use the internal HTTP client.
\`\`\`

~~~specguardian
rules:
  - id: frozen-migrations
    type: protected
    paths: ["migrations/**"]
~~~
`;

test("extracts single rules, lists and `rules:` mappings from markdown", () => {
  const { rules, errors } = extractRuleBlocks(SPEC);
  assert.equal(errors.length, 0);
  assert.deepEqual(
    rules.map((r) => (r as { id: string }).id),
    ["payment-no-axios", "frozen-migrations"],
  );
});

test("loads rules from guard.yaml and spec sources, and reports bad rules", () => {
  const root = makeProject({
    ".specguardian/guard.yaml": [
      "version: 1",
      "sources: ['openspec/specs/**/*.md']",
      "rules:",
      "  - id: ui-db",
      "    type: boundary",
      "    from: ['src/ui/**']",
      "    to: ['src/db/**']",
      "  - id: broken",
      "    type: forbid-import",
      "  - id: payment-no-axios",
      "    type: protected",
      "    paths: ['x/**']",
    ].join("\n"),
    "openspec/specs/payment/spec.md": SPEC,
    "src/core/payment/pay.ts": `import axios from "axios";\n`,
    "src/ui/Page.tsx": `import { q } from "../db/q";\n`,
    "node_modules/pkg/index.js": `import axios from "axios";\n`,
  });

  const config = loadConfig(root);
  assert.ok(config);
  assert.deepEqual(
    config.rules.map((r) => `${r.id}@${r.source}`),
    ["ui-db@.specguardian/guard.yaml", "payment-no-axios@.specguardian/guard.yaml", "frozen-migrations@openspec/specs/payment/spec.md"],
  );
  assert.equal(config.errors.length, 2);
  assert.match(config.errors.join("\n"), /broken.*modules/);
  assert.match(config.errors.join("\n"), /duplicate rule id "payment-no-axios"/);

  const { violations } = checkProject(config);
  assert.deepEqual(
    violations.map((v) => `${v.ruleId}:${v.file}`),
    ["ui-db:src/ui/Page.tsx"],
  );
});

test("returns null when the project has no guard config", () => {
  assert.equal(loadConfig(makeProject({ "a.ts": "" })), null);
});
