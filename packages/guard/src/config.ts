import path from "node:path";
import { matchesAny, readTextIfExists, SPECGUARDIAN_DIR, walkFiles } from "@liangf7943/specguardian-core";
import YAML from "yaml";
import { extractRuleBlocks } from "./markdown.js";
import type { GuardConfig, Rule, RuleType, Severity } from "./types.js";

export const CONFIG_FILE = `${SPECGUARDIAN_DIR}/guard.yaml`;

export const DEFAULT_EXCLUDE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.venv/**",
  `${SPECGUARDIAN_DIR}/**`,
];

const RULE_TYPES: RuleType[] = ["forbid-import", "boundary", "protected", "forbid-pattern"];

interface RawConfig {
  version?: number;
  sources?: unknown;
  exclude?: unknown;
  aliases?: unknown;
  rules?: unknown;
}

export function configPath(root: string): string {
  return path.join(root, CONFIG_FILE);
}

export function loadConfig(root: string): GuardConfig | null {
  const text = readTextIfExists(configPath(root));
  if (text === null) return null;

  const errors: string[] = [];
  let raw: RawConfig = {};
  try {
    raw = (YAML.parse(text) ?? {}) as RawConfig;
  } catch (err) {
    errors.push(`${CONFIG_FILE}: invalid YAML (${(err as Error).message})`);
  }

  const exclude = [...DEFAULT_EXCLUDE, ...stringList(raw.exclude, `${CONFIG_FILE}: exclude`, errors)];
  const aliases = stringMap(raw.aliases, `${CONFIG_FILE}: aliases`, errors);

  const rawRules: Array<{ value: unknown; source: string }> = [];
  for (const value of asArray(raw.rules)) rawRules.push({ value, source: CONFIG_FILE });

  const sources = stringList(raw.sources, `${CONFIG_FILE}: sources`, errors);
  if (sources.length > 0) {
    for (const file of walkFiles(root, exclude.filter((g) => g !== `${SPECGUARDIAN_DIR}/**`))) {
      if (!matchesAny(file, sources)) continue;
      const markdown = readTextIfExists(path.join(root, file)) ?? "";
      const blocks = extractRuleBlocks(markdown);
      for (const err of blocks.errors) errors.push(`${file}: ${err}`);
      for (const value of blocks.rules) rawRules.push({ value, source: file });
    }
  }

  const rules: Rule[] = [];
  const seen = new Set<string>();
  for (const { value, source } of rawRules) {
    const result = parseRule(value, source);
    if (typeof result === "string") {
      errors.push(result);
      continue;
    }
    if (seen.has(result.id)) {
      errors.push(`${source}: duplicate rule id "${result.id}" (skipped)`);
      continue;
    }
    seen.add(result.id);
    rules.push(result);
  }

  return { root, rules, exclude, aliases, errors };
}

/** Returns a validated rule, or an error message. */
export function parseRule(value: unknown, source: string): Rule | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `${source}: each rule must be a mapping`;
  }
  const r = value as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : null;
  if (!id) return `${source}: rule is missing an "id"`;
  const where = `${source}: rule "${id}"`;

  const type = r.type as RuleType;
  if (!RULE_TYPES.includes(type)) {
    return `${where}: "type" must be one of ${RULE_TYPES.join(", ")}`;
  }
  const severity = (r.severity ?? "error") as Severity;
  if (severity !== "error" && severity !== "warn") return `${where}: "severity" must be "error" or "warn"`;

  const errors: string[] = [];
  const base = {
    id,
    severity,
    source,
    paths: r.paths === undefined ? undefined : stringList(r.paths, `${where}: paths`, errors),
    exclude: r.exclude === undefined ? undefined : stringList(r.exclude, `${where}: exclude`, errors),
    message: typeof r.message === "string" ? r.message : undefined,
  };

  let rule: Rule;
  switch (type) {
    case "forbid-import": {
      const modules = stringList(r.modules, `${where}: modules`, errors);
      if (modules.length === 0) errors.push(`${where}: "modules" must list at least one module`);
      rule = { ...base, type, modules };
      break;
    }
    case "boundary": {
      const from = stringList(r.from, `${where}: from`, errors);
      const to = stringList(r.to, `${where}: to`, errors);
      if (from.length === 0 || to.length === 0) errors.push(`${where}: "from" and "to" are required`);
      rule = { ...base, type, from, to };
      break;
    }
    case "protected": {
      if (!base.paths || base.paths.length === 0) errors.push(`${where}: "paths" is required`);
      rule = { ...base, type };
      break;
    }
    case "forbid-pattern": {
      const pattern = typeof r.pattern === "string" ? r.pattern : "";
      const flags = typeof r.flags === "string" ? r.flags : undefined;
      if (!pattern) errors.push(`${where}: "pattern" is required`);
      else {
        try {
          new RegExp(pattern, flags);
        } catch (err) {
          errors.push(`${where}: invalid pattern (${(err as Error).message})`);
        }
      }
      rule = { ...base, type, pattern, flags };
      break;
    }
  }

  return errors.length > 0 ? errors.join("; ") : rule;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function stringList(value: unknown, where: string, errors: string[]): string[] {
  const list = asArray(value);
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else errors.push(`${where}: expected a string or a list of strings`);
  }
  return out;
}

function stringMap(value: unknown, where: string, errors: string[]): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${where}: expected a mapping`);
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
    else errors.push(`${where}: "${k}" must map to a string`);
  }
  return out;
}
