import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, SPECGUARDIAN_DIR, writeJsonFile, writeTextFile } from "@liangf7943/specguardian-core";
import { configPath } from "./config.js";

export const DEFAULT_COMMAND = "npx -y @liangf7943/specguardian-guard";
const MCP_SERVER_NAME = "specguardian-guard";
const SKILL_NAME = "specguardian-guard";
const CLAUDE_MATCHER = "Write|Edit|MultiEdit";

export interface InstallOptions {
  /** Command that runs the CLI, e.g. `npx -y @liangf7943/specguardian-guard` or `node ./node_modules/@liangf7943/specguardian-guard/dist/cli.js`. */
  command?: string;
  platform?: NodeJS.Platform;
}

interface HookHandler {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

interface ClaudeMatcherGroup {
  matcher?: string;
  hooks?: HookHandler[];
  [key: string]: unknown;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeMatcherGroup[]>;
  [key: string]: unknown;
}

interface CursorHook {
  command?: string;
  [key: string]: unknown;
}

interface CursorHooksFile {
  version?: number;
  hooks?: Record<string, CursorHook[]>;
  [key: string]: unknown;
}

interface McpFile {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export function configTemplate(root: string): string {
  const sources: string[] = [];
  if (existsSync(path.join(root, "openspec"))) sources.push("openspec/specs/**/*.md", "openspec/changes/**/*.md");
  if (existsSync(path.join(root, ".specify"))) sources.push(".specify/memory/*.md");
  if (existsSync(path.join(root, "specs"))) sources.push("specs/**/*.md");
  if (existsSync(path.join(root, ".kiro"))) sources.push(".kiro/specs/**/*.md", ".kiro/steering/*.md");
  sources.push(`${SPECGUARDIAN_DIR}/**/*.md`);

  return `# SpecGuardian guard configuration.
# Rules are enforced when an AI agent edits a file (hooks) and by \`specguardian-guard check\`.
version: 1

# Markdown files scanned for fenced \`\`\`specguardian blocks containing rules.
sources:
${sources.map((s) => `  - ${s}`).join("\n")}

# Extra paths to ignore (node_modules, dist, build, .git ... are ignored by default).
exclude: []

# Import prefix rewrites used by boundary rules, e.g. "@/": "src/".
aliases: {}

rules:
  # Example rules. Adjust the paths to your project, or delete them.
  - id: no-direct-db-in-ui
    type: boundary
    from: ["src/ui/**"]
    to: ["src/db/**"]
    message: UI code must go through the service layer.

  - id: no-console-log
    type: forbid-pattern
    paths: ["src/**"]
    pattern: "console\\\\.log\\\\("
    severity: warn
    message: Use the project logger.

  # - id: payment-no-axios
  #   type: forbid-import
  #   paths: ["src/core/payment/**"]
  #   modules: ["axios"]
  #   message: Payment code must use the internal HTTP client.

  # - id: frozen-migrations
  #   type: protected
  #   paths: ["migrations/**"]
  #   message: Applied migrations are immutable. Add a new migration instead.
`;
}

/** Creates `.specguardian/guard.yaml`. Returns false when it already exists and `force` is not set. */
export function initProject(root: string, force = false): boolean {
  const file = configPath(root);
  if (existsSync(file) && !force) return false;
  writeTextFile(file, configTemplate(root));
  return true;
}

export function installClaude(root: string, options: InstallOptions = {}): string[] {
  const command = options.command ?? DEFAULT_COMMAND;
  const settingsFile = path.join(root, ".claude", "settings.json");
  const settings = readJsonFile<ClaudeSettings>(settingsFile, {});
  settings.hooks ??= {};
  const groups = (settings.hooks.PreToolUse ?? [])
    .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !isGuardHook(h.command, "claude")) }))
    .filter((group) => group.hooks.length > 0);
  groups.push({
    matcher: CLAUDE_MATCHER,
    hooks: [{ type: "command", command: `${command} hook claude`, statusMessage: "SpecGuardian: checking rules" }],
  });
  settings.hooks.PreToolUse = groups;
  writeJsonFile(settingsFile, settings);

  const mcpFile = path.join(root, ".mcp.json");
  writeMcpEntry(mcpFile, command, options.platform);

  const skillFile = path.join(root, ".claude", "skills", SKILL_NAME, "SKILL.md");
  writeTextFile(skillFile, readSkill());
  return [settingsFile, mcpFile, skillFile];
}

export function installCursor(root: string, options: InstallOptions = {}): string[] {
  const command = options.command ?? DEFAULT_COMMAND;
  const hooksFile = path.join(root, ".cursor", "hooks.json");
  const data = readJsonFile<CursorHooksFile>(hooksFile, { version: 1 });
  data.version ??= 1;
  data.hooks ??= {};
  const hooks = (data.hooks.preToolUse ?? []).filter((h) => !isGuardHook(h.command, "cursor"));
  hooks.push({ command: `${command} hook cursor`, matcher: "Write" });
  data.hooks.preToolUse = hooks;
  writeJsonFile(hooksFile, data);

  const mcpFile = path.join(root, ".cursor", "mcp.json");
  writeMcpEntry(mcpFile, command, options.platform);

  const written = [hooksFile, mcpFile];
  if (!existsSync(path.join(root, ".claude", "skills", SKILL_NAME, "SKILL.md"))) {
    const skillFile = path.join(root, ".cursor", "skills", SKILL_NAME, "SKILL.md");
    writeTextFile(skillFile, readSkill());
    written.push(skillFile);
  }
  return written;
}

function writeMcpEntry(file: string, command: string, platform: NodeJS.Platform = process.platform): void {
  const data = readJsonFile<McpFile>(file, {});
  data.mcpServers ??= {};
  const [exe, ...args] = command.split(/\s+/).filter(Boolean);
  const entry =
    platform === "win32" && exe === "npx"
      ? { command: "cmd", args: ["/c", exe, ...args, "mcp"] }
      : { command: exe, args: [...args, "mcp"] };
  data.mcpServers[MCP_SERVER_NAME] = entry;
  writeJsonFile(file, data);
}

function isGuardHook(command: string | undefined, target: "claude" | "cursor"): boolean {
  return typeof command === "string" && command.includes("guard") && command.trimEnd().endsWith(`hook ${target}`);
}

export function readSkill(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "skill", "SKILL.md"), "utf8");
}
