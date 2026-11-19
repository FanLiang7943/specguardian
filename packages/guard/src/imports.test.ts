import assert from "node:assert/strict";
import { test } from "node:test";
import { extractImports, resolveImportCandidates } from "./imports.js";

test("extracts JS/TS imports of every form with line numbers", () => {
  const code = [
    `import axios from "axios";`,
    `import {`,
    `  a,`,
    `  b,`,
    `} from './lib/ab';`,
    `import type { T } from "@/types";`,
    `import "./side-effect";`,
    `export * from "../reexport";`,
    `const x = require("lodash/fp");`,
    `const y = await import("dyn");`,
  ].join("\n");
  const refs = extractImports("src/a.ts", code).map((r) => `${r.line}:${r.specifier}`);
  assert.deepEqual(refs, ["1:axios", "5:./lib/ab", "6:@/types", "7:./side-effect", "8:../reexport", "9:lodash/fp", "10:dyn"]);
});

test("ignores imports in comments but keeps URLs in strings", () => {
  const code = `// import a from "commented";\n/* require("block") */\nconst u = "http://x";\nimport b from "real";`;
  assert.deepEqual(
    extractImports("a.js", code).map((r) => r.specifier),
    ["real"],
  );
});

test("extracts python imports", () => {
  const code = "import os, requests as r\nfrom app.db import session  # comment\nfrom ..core import x\n";
  assert.deepEqual(
    extractImports("app/ui/view.py", code).map((r) => `${r.line}:${r.specifier}`),
    ["1:os", "1:requests", "2:app.db", "3:..core"],
  );
});

test("resolves relative, aliased and python imports to repo paths", () => {
  assert.ok(resolveImportCandidates("src/ui/Button.tsx", "../db/client", {}).includes("src/db/client.ts"));
  assert.ok(resolveImportCandidates("src/ui/Button.tsx", "@/db", { "@/": "src/" }).includes("src/db/index.ts"));
  assert.ok(resolveImportCandidates("app/ui/view.py", "..db.models", {}).includes("app/db/models.py"));
  assert.ok(resolveImportCandidates("app/ui/view.py", "app.db", {}).includes("app/db/__init__.py"));
});
