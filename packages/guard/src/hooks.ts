import path from "node:path";
import { findProjectRoot, readTextIfExists, relativeToRoot } from "@liangf7943/specguardian-core";
import { checkChange } from "./checker.js";
import { loadConfig } from "./config.js";
import { proposedChange } from "./edits.js";
import { formatBlockMessage, formatWarningMessage } from "./format.js";
import type { Violation } from "./types.js";

export interface HookResult {
  stdout: string;
  exitCode: number;
}

export interface Evaluation {
  file: string;
  errors: Violation[];
  warnings: Violation[];
  configErrors: string[];
}

/** Evaluates a file-editing tool call. Returns null when SpecGuardian has nothing to say about it. */
export function evaluateToolCall(toolInput: Record<string, unknown> | undefined, baseDir: string): Evaluation | null {
  const resolve = (p: string) => path.resolve(baseDir, p);
  const change = proposedChange(toolInput, (p) => readTextIfExists(resolve(p)));
  if (!change) return null;

  const absFile = resolve(change.filePath);
  const root = findProjectRoot(path.dirname(absFile)) ?? findProjectRoot(baseDir);
  if (!root) return null;
  const file = relativeToRoot(root, absFile);
  if (!file) return null;
  const config = loadConfig(root);
  if (!config) return null;

  const violations = checkChange(config, file, change.before, change.after);
  return {
    file,
    errors: violations.filter((v) => v.severity === "error"),
    warnings: violations.filter((v) => v.severity === "warn"),
    configErrors: config.errors,
  };
}

/** Claude Code `PreToolUse` hook for Write/Edit/MultiEdit. */
export function handleClaudePreToolUse(input: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): HookResult {
  const baseDir = env.CLAUDE_PROJECT_DIR || (typeof input.cwd === "string" ? input.cwd : process.cwd());
  const result = evaluateToolCall(input.tool_input as Record<string, unknown> | undefined, baseDir);
  if (!result) return { stdout: "", exitCode: 0 };

  if (result.errors.length > 0) {
    return json({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: formatBlockMessage(result.file, result.errors),
      },
    });
  }
  const context = formatWarningMessage(result.file, result.warnings, result.configErrors);
  if (!context) return { stdout: "", exitCode: 0 };
  return json({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: context } });
}

/** Cursor `preToolUse` hook. Cursor requires a JSON response for every call. */
export function handleCursorPreToolUse(input: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): HookResult {
  const roots = Array.isArray(input.workspace_roots) ? (input.workspace_roots as unknown[]) : [];
  const baseDir =
    env.CURSOR_PROJECT_DIR ||
    (typeof roots[0] === "string" ? roots[0] : undefined) ||
    (typeof input.cwd === "string" ? input.cwd : process.cwd());
  const result = evaluateToolCall(input.tool_input as Record<string, unknown> | undefined, baseDir);
  if (!result || result.errors.length === 0) return json({ permission: "allow" });

  const message = formatBlockMessage(result.file, result.errors);
  return json({
    permission: "deny",
    user_message: `SpecGuardian blocked an edit to ${result.file} (${result.errors.map((v) => v.ruleId).join(", ")}).`,
    agent_message: message,
  });
}

function json(value: unknown): HookResult {
  return { stdout: JSON.stringify(value), exitCode: 0 };
}
