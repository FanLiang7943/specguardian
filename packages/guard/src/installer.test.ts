import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { loadConfig } from "./config.js";
import { initProject, installClaude, installCursor } from "./installer.js";
import { makeProject } from "./project.fixture.js";

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

test("init writes a valid config that picks up OpenSpec sources", () => {
  const root = makeProject({ "openspec/specs/.keep": "" });
  assert.equal(initProject(root), true);
  assert.equal(initProject(root), false);
  const config = loadConfig(root);
  assert.ok(config);
  assert.deepEqual(config.errors, []);
  assert.ok(readFileSync(path.join(root, ".specguardian", "guard.yaml"), "utf8").includes("openspec/specs/**/*.md"));
});

test("Claude install is idempotent and keeps unrelated hooks and settings", () => {
  const root = makeProject({
    ".claude/settings.json": JSON.stringify({
      permissions: { allow: ["Bash(npm test)"] },
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./mine.sh" }] }] },
    }),
  });
  installClaude(root, { platform: "linux" });
  installClaude(root, { platform: "linux" });

  const settings = readJson(path.join(root, ".claude", "settings.json"));
  assert.deepEqual(settings.permissions, { allow: ["Bash(npm test)"] });
  const commands = settings.hooks.PreToolUse.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
  assert.deepEqual(commands, ["./mine.sh", "npx -y @liangf7943/specguardian-guard hook claude"]);

  const mcp = readJson(path.join(root, ".mcp.json"));
  assert.deepEqual(mcp.mcpServers["specguardian-guard"], { command: "npx", args: ["-y", "@liangf7943/specguardian-guard", "mcp"] });
  assert.ok(existsSync(path.join(root, ".claude", "skills", "specguardian-guard", "SKILL.md")));
});

test("Cursor install wraps npx with cmd on Windows and reuses the Claude skill", () => {
  const root = makeProject({});
  installClaude(root, { platform: "win32" });
  installCursor(root, { platform: "win32" });
  installCursor(root, { platform: "win32" });

  const hooks = readJson(path.join(root, ".cursor", "hooks.json"));
  assert.deepEqual(hooks, { version: 1, hooks: { preToolUse: [{ command: "npx -y @liangf7943/specguardian-guard hook cursor", matcher: "Write" }] } });
  const mcp = readJson(path.join(root, ".cursor", "mcp.json"));
  assert.deepEqual(mcp.mcpServers["specguardian-guard"].args, ["/c", "npx", "-y", "@liangf7943/specguardian-guard", "mcp"]);
  assert.equal(existsSync(path.join(root, ".cursor", "skills")), false);
});
