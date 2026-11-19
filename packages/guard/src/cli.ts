#!/usr/bin/env node
import path from "node:path";
import { findProjectRoot, readStdin, relativeToRoot } from "@liangf7943/specguardian-core";
import { checkProject, rulesForPath } from "./checker.js";
import { CONFIG_FILE, loadConfig } from "./config.js";
import { formatRule, formatViolation } from "./format.js";
import { handleClaudePreToolUse, handleCursorPreToolUse, type HookResult } from "./hooks.js";
import { initProject, installClaude, installCursor } from "./installer.js";
import { runMcpServer } from "./mcp.js";
import { VERSION } from "./version.js";

const HELP = `specguardian-guard ${VERSION}
Enforce the hard rules in your specs while AI agents edit code.

Usage:
  specguardian-guard init [--force]                 Create ${CONFIG_FILE}
  specguardian-guard install [--claude] [--cursor]  Register hooks, MCP server and skill
                    [--command "<cmd>"]           Command used to run this CLI (default: npx -y @liangf7943/specguardian-guard)
  specguardian-guard check [files...] [--json]      Scan for violations (exit 1 on errors)
  specguardian-guard rules [file]                   List rules, or the rules for one file
  specguardian-guard hook <claude|cursor>           Hook entry point (reads JSON on stdin)
  specguardian-guard mcp                            Start the MCP server on stdio
`;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) flags.set(name, inline);
    else if (name === "command" && argv[i + 1] !== undefined) flags.set(name, argv[++i]);
    else flags.set(name, true);
  }
  return { positional, flags };
}

function requireConfig() {
  const root = findProjectRoot(process.cwd());
  const config = root ? loadConfig(root) : null;
  if (!config) {
    console.error(`No ${CONFIG_FILE} found. Run \`specguardian-guard init\` first.`);
    process.exit(2);
  }
  for (const err of config.errors) console.error(`warning: ${err}`);
  return config;
}

async function runHook(target: string): Promise<void> {
  let result: HookResult;
  try {
    const input = JSON.parse((await readStdin()) || "{}") as Record<string, unknown>;
    if (target === "claude") result = handleClaudePreToolUse(input);
    else if (target === "cursor") result = handleCursorPreToolUse(input);
    else {
      console.error(`Unknown hook target "${target}". Use "claude" or "cursor".`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`SpecGuardian hook failed: ${(err as Error).message}`);
    if (target === "cursor") process.stdout.write(JSON.stringify({ permission: "allow" }));
    process.exit(target === "cursor" ? 0 : 1);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.exitCode);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  switch (command) {
    case "init": {
      const root = process.cwd();
      if (initProject(root, flags.has("force"))) console.log(`Created ${CONFIG_FILE}. Edit it, then run \`specguardian-guard install\`.`);
      else console.log(`${CONFIG_FILE} already exists. Use --force to overwrite it.`);
      return;
    }
    case "install": {
      const root = findProjectRoot(process.cwd()) ?? process.cwd();
      const cmd = typeof flags.get("command") === "string" ? (flags.get("command") as string) : undefined;
      const targets = ["claude", "cursor"].filter((t) => flags.has(t));
      if (targets.length === 0) targets.push("claude");
      const written: string[] = [];
      if (targets.includes("claude")) written.push(...installClaude(root, { command: cmd }));
      if (targets.includes("cursor")) written.push(...installCursor(root, { command: cmd }));
      console.log(`Installed SpecGuardian guard for ${targets.join(" and ")}:`);
      for (const file of written) console.log(`  ${path.relative(root, file)}`);
      return;
    }
    case "check": {
      const config = requireConfig();
      const files = positional.length
        ? positional.map((p) => relativeToRoot(config.root, path.resolve(p))).filter((p): p is string => p !== null)
        : undefined;
      const { violations, filesChecked } = checkProject(config, files);
      const errors = violations.filter((v) => v.severity === "error");
      if (flags.has("json")) {
        console.log(JSON.stringify({ filesChecked, violations, configErrors: config.errors }, null, 2));
      } else {
        for (const v of violations) console.log(`${v.severity === "error" ? "error" : "warn "} ${formatViolation(v)}`);
        console.log(`${errors.length} error(s), ${violations.length - errors.length} warning(s) in ${filesChecked} file(s).`);
      }
      process.exit(errors.length > 0 ? 1 : 0);
    }
    case "rules": {
      const config = requireConfig();
      const file = positional[0] ? relativeToRoot(config.root, path.resolve(positional[0])) : null;
      const rules = file ? rulesForPath(config, file) : config.rules;
      if (rules.length === 0) console.log("No rules apply.");
      for (const rule of rules) console.log(formatRule(rule));
      return;
    }
    case "hook":
      return runHook(positional[0] ?? "");
    case "mcp":
      return runMcpServer();
    case "--version":
    case "-v":
      console.log(VERSION);
      return;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error((err as Error).stack ?? String(err));
  process.exit(1);
});
