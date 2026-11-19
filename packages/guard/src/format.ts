import { CONFIG_FILE } from "./config.js";
import type { Rule, Violation } from "./types.js";

export function formatViolation(v: Violation): string {
  const where = v.line ? `${v.file}:${v.line}` : v.file;
  const message = v.message ? ` — ${v.message}` : "";
  return `[${v.ruleId}] ${where} ${v.detail}${message} (rule from ${v.source})`;
}

export function formatRule(rule: Rule): string {
  let what: string;
  switch (rule.type) {
    case "forbid-import":
      what = `files in ${(rule.paths ?? ["**"]).join(", ")} must not import ${rule.modules.join(", ")}`;
      break;
    case "boundary":
      what = `files in ${rule.from.join(", ")} must not import ${rule.to.join(", ")}`;
      break;
    case "protected":
      what = `existing files in ${(rule.paths ?? []).join(", ")} must not be edited (new files are allowed)`;
      break;
    case "forbid-pattern":
      what = `files in ${(rule.paths ?? ["**"]).join(", ")} must not match /${rule.pattern}/${rule.flags ?? ""}`;
      break;
  }
  const message = rule.message ? ` — ${rule.message}` : "";
  return `[${rule.id}] (${rule.type}, ${rule.severity}) ${what}${message} (from ${rule.source})`;
}

export function formatBlockMessage(file: string, errors: Violation[]): string {
  return [
    `SpecGuardian blocked this edit to ${file}. It breaks rules declared in the project's specs:`,
    ...errors.map((v) => `- ${formatViolation(v)}`),
    `Change the code so it respects these rules. If a rule itself is wrong, stop and ask the user to update it (${CONFIG_FILE} or the spec that declares it). Do not work around the guard.`,
  ].join("\n");
}

export function formatWarningMessage(file: string, warnings: Violation[], configErrors: string[]): string {
  const lines: string[] = [];
  if (warnings.length > 0) {
    lines.push(`SpecGuardian warnings for ${file}:`, ...warnings.map((v) => `- ${formatViolation(v)}`));
  }
  if (configErrors.length > 0) {
    lines.push("SpecGuardian found problems in its rules (invalid rules are skipped):", ...configErrors.map((e) => `- ${e}`));
  }
  return lines.join("\n");
}
