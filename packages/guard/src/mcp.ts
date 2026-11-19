import path from "node:path";
import { findProjectRoot, readTextIfExists, relativeToRoot } from "@liangf7943/specguardian-core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkChange, checkContent, checkProject, rulesForPath } from "./checker.js";
import { CONFIG_FILE, loadConfig } from "./config.js";
import { formatRule, formatViolation } from "./format.js";
import type { GuardConfig } from "./types.js";
import { VERSION } from "./version.js";

type Loaded = { config: GuardConfig } | { error: string };

function load(): Loaded {
  const start = process.env.SPECGUARDIAN_ROOT || process.cwd();
  const root = findProjectRoot(start);
  if (!root) return { error: `No ${CONFIG_FILE} found from ${start}. Run \`specguardian-guard init\` first.` };
  const config = loadConfig(root);
  if (!config) return { error: `No ${CONFIG_FILE} found in ${root}.` };
  return { config };
}

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], isError };
}

function withConfigErrors(config: GuardConfig, body: string): string {
  if (config.errors.length === 0) return body;
  return `${body}\n\nRule problems (invalid rules are skipped):\n${config.errors.map((e) => `- ${e}`).join("\n")}`;
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "specguardian-guard", version: VERSION });

  server.registerTool(
    "guard_list_rules",
    {
      title: "List SpecGuardian rules",
      description:
        "List the hard rules from the project's specs. Pass a file path to see only the rules that apply to it. Call this before editing files in an unfamiliar area.",
      inputSchema: { path: z.string().optional().describe("File path, absolute or relative to the project root") },
    },
    async ({ path: filePath }) => {
      const loaded = load();
      if ("error" in loaded) return text(loaded.error, true);
      const { config } = loaded;
      let rules = config.rules;
      if (filePath) {
        const rel = relativeToRoot(config.root, path.resolve(config.root, filePath));
        if (!rel) return text(`${filePath} is outside the project root ${config.root}.`, true);
        rules = rulesForPath(config, rel);
      }
      const body = rules.length === 0 ? "No rules apply." : rules.map(formatRule).join("\n");
      return text(withConfigErrors(config, body));
    },
  );

  server.registerTool(
    "guard_check_file",
    {
      title: "Check a file against SpecGuardian rules",
      description:
        "Check a file against the spec rules. With `content`, checks the proposed new content and reports only violations the change would introduce. Without it, checks the file as it is on disk.",
      inputSchema: {
        path: z.string().describe("File path, absolute or relative to the project root"),
        content: z.string().optional().describe("Proposed full file content"),
      },
    },
    async ({ path: filePath, content }) => {
      const loaded = load();
      if ("error" in loaded) return text(loaded.error, true);
      const { config } = loaded;
      const abs = path.resolve(config.root, filePath);
      const rel = relativeToRoot(config.root, abs);
      if (!rel) return text(`${filePath} is outside the project root ${config.root}.`, true);
      const current = readTextIfExists(abs);
      const violations =
        content !== undefined ? checkChange(config, rel, current, content) : checkContent(config, rel, current ?? "");
      const body =
        violations.length === 0 ? `OK: no rule violations in ${rel}.` : violations.map(formatViolation).join("\n");
      return text(withConfigErrors(config, body), violations.some((v) => v.severity === "error"));
    },
  );

  server.registerTool(
    "guard_check_drift",
    {
      title: "Scan the project for drift from the specs",
      description: "Scan the project (or the given files) for code that breaks the spec rules.",
      inputSchema: {
        paths: z.array(z.string()).optional().describe("Files to check, relative to the project root. Defaults to all files."),
      },
    },
    async ({ paths }) => {
      const loaded = load();
      if ("error" in loaded) return text(loaded.error, true);
      const { config } = loaded;
      const files = paths
        ?.map((p) => relativeToRoot(config.root, path.resolve(config.root, p)))
        .filter((p): p is string => p !== null);
      const { violations, filesChecked } = checkProject(config, files);
      const summary = `${violations.length} violation(s) in ${filesChecked} checked file(s).`;
      const body = violations.length === 0 ? summary : `${summary}\n${violations.map(formatViolation).join("\n")}`;
      return text(withConfigErrors(config, body));
    },
  );

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
