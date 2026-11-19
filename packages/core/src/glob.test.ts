import assert from "node:assert/strict";
import { test } from "node:test";
import { matchGlob } from "./glob.js";

test("double star matches nested paths and the directory itself", () => {
  assert.ok(matchGlob("src/core/payment/client.ts", "src/core/payment/**"));
  assert.ok(matchGlob("src/core/payment", "src/core/payment/**"));
  assert.ok(!matchGlob("src/core/payments/client.ts", "src/core/payment/**"));
});

test("leading double star matches at any depth", () => {
  assert.ok(matchGlob("node_modules/a/b.js", "**/node_modules/**"));
  assert.ok(matchGlob("packages/x/node_modules/a.js", "**/node_modules/**"));
});

test("single star does not cross directories", () => {
  assert.ok(matchGlob("src/a.ts", "src/*.ts"));
  assert.ok(!matchGlob("src/x/a.ts", "src/*.ts"));
});

test("pattern without slash matches basename at any depth", () => {
  assert.ok(matchGlob("deep/dir/file.test.ts", "*.test.ts"));
});

test("braces and windows separators", () => {
  assert.ok(matchGlob("src\\ui\\Button.tsx", "src/ui/**/*.{ts,tsx}"));
  assert.ok(!matchGlob("src/ui/Button.css", "src/ui/**/*.{ts,tsx}"));
});

test("dots are literal", () => {
  assert.ok(!matchGlob("srcXts", "src.ts"));
});
