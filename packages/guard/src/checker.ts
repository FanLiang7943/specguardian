import path from "node:path";
import { isGlob, matchGlob, matchesAny, readTextIfExists, walkFiles } from "@liangf7943/specguardian-core";
import { extractImports, languageOf, resolveImportCandidates } from "./imports.js";
import type { GuardConfig, Rule, Violation } from "./types.js";

const MAX_FILE_BYTES = 1024 * 1024;

export function ruleScope(rule: Rule): string[] {
  if (rule.type === "boundary") return rule.from;
  return rule.paths && rule.paths.length > 0 ? rule.paths : ["**"];
}

export function ruleApplies(rule: Rule, file: string): boolean {
  return matchesAny(file, ruleScope(rule)) && !matchesAny(file, rule.exclude);
}

export function rulesForPath(config: GuardConfig, file: string): Rule[] {
  if (matchesAny(file, config.exclude)) return [];
  return config.rules.filter((rule) => ruleApplies(rule, file));
}

export function moduleMatches(specifier: string, pattern: string): boolean {
  if (isGlob(pattern)) return matchGlob(specifier, pattern) || matchGlob(specifier, `${pattern}/**`);
  return specifier === pattern || specifier.startsWith(`${pattern}/`) || specifier.startsWith(`${pattern}.`);
}

/** Checks file content against content rules. `protected` rules are not evaluated here. */
export function checkContent(config: GuardConfig, file: string, content: string): Violation[] {
  const rules = rulesForPath(config, file).filter((r) => r.type !== "protected");
  if (rules.length === 0) return [];

  const violations: Violation[] = [];
  const needsImports = rules.some((r) => r.type === "forbid-import" || r.type === "boundary");
  const imports = needsImports && languageOf(file) ? extractImports(file, content) : [];

  for (const rule of rules) {
    const base = { ruleId: rule.id, type: rule.type, severity: rule.severity, file, message: rule.message, source: rule.source };
    if (rule.type === "forbid-import") {
      for (const ref of imports) {
        if (rule.modules.some((m) => moduleMatches(ref.specifier, m))) {
          violations.push({ ...base, line: ref.line, detail: `imports "${ref.specifier}"` });
        }
      }
    } else if (rule.type === "boundary") {
      for (const ref of imports) {
        const candidates = resolveImportCandidates(file, ref.specifier, config.aliases);
        if (candidates.some((c) => matchesAny(c, rule.to))) {
          violations.push({ ...base, line: ref.line, detail: `imports "${ref.specifier}" across a boundary` });
        }
      }
    } else if (rule.type === "forbid-pattern") {
      const flags = new Set((rule.flags ?? "").split(""));
      flags.add("g");
      const re = new RegExp(rule.pattern, [...flags].join(""));
      for (const m of content.matchAll(re)) {
        if (m[0] === "") break;
        const line = content.slice(0, m.index).split("\n").length;
        violations.push({ ...base, line, detail: `contains "${truncate(m[0])}"` });
      }
    }
  }
  return violations;
}

/**
 * Checks a proposed change. Only violations introduced by the change are returned,
 * so existing code does not block unrelated edits.
 */
export function checkChange(config: GuardConfig, file: string, before: string | null, after: string): Violation[] {
  const protectedRules = rulesForPath(config, file).filter((r) => r.type === "protected");
  const out: Violation[] = protectedRules.map((rule) => ({
    ruleId: rule.id,
    type: rule.type,
    severity: rule.severity,
    file,
    detail: "edits a protected file",
    message: rule.message,
    source: rule.source,
  }));
  const previous = before === null ? [] : checkContent(config, file, before);
  return out.concat(newViolations(previous, checkContent(config, file, after)));
}

export function newViolations(before: Violation[], after: Violation[]): Violation[] {
  const counts = new Map<string, number>();
  const key = (v: Violation) => `${v.ruleId}\u0000${v.detail}`;
  for (const v of before) counts.set(key(v), (counts.get(key(v)) ?? 0) + 1);
  const out: Violation[] = [];
  for (const v of after) {
    const k = key(v);
    const n = counts.get(k) ?? 0;
    if (n > 0) counts.set(k, n - 1);
    else out.push(v);
  }
  return out;
}

/** Scans files in the project (or only `files`) for content rule violations. */
export function checkProject(config: GuardConfig, files?: string[]): { violations: Violation[]; filesChecked: number } {
  const candidates = files ?? walkFiles(config.root, config.exclude);
  const violations: Violation[] = [];
  let filesChecked = 0;
  for (const file of candidates) {
    if (rulesForPath(config, file).every((r) => r.type === "protected")) continue;
    const abs = path.join(config.root, file);
    const content = readTextIfExists(abs);
    if (content === null || content.length > MAX_FILE_BYTES || content.includes("\u0000")) continue;
    filesChecked++;
    violations.push(...checkContent(config, file, content));
  }
  return { violations, filesChecked };
}

function truncate(text: string, max = 60): string {
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
