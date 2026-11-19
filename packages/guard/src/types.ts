export type Severity = "error" | "warn";

export type RuleType = "forbid-import" | "boundary" | "protected" | "forbid-pattern";

interface BaseRule {
  id: string;
  type: RuleType;
  /** Files the rule applies to. Defaults to every file. Not used by `boundary` (see `from`). */
  paths?: string[];
  exclude?: string[];
  severity: Severity;
  message?: string;
  /** Where the rule was declared, e.g. `.specguardian/guard.yaml` or a spec markdown file. */
  source: string;
}

/** Files in `paths` must not import any of `modules`. */
export interface ForbidImportRule extends BaseRule {
  type: "forbid-import";
  modules: string[];
}

/** Files in `from` must not import files in `to`. */
export interface BoundaryRule extends BaseRule {
  type: "boundary";
  from: string[];
  to: string[];
}

/** Existing files in `paths` must not be edited by agents. New files may be created. */
export interface ProtectedRule extends BaseRule {
  type: "protected";
}

/** Files in `paths` must not contain text matching `pattern`. */
export interface ForbidPatternRule extends BaseRule {
  type: "forbid-pattern";
  pattern: string;
  flags?: string;
}

export type Rule = ForbidImportRule | BoundaryRule | ProtectedRule | ForbidPatternRule;

export interface GuardConfig {
  root: string;
  rules: Rule[];
  exclude: string[];
  /** Import prefix rewrites used to resolve boundaries, e.g. `{ "@/": "src/" }`. */
  aliases: Record<string, string>;
  /** Problems found while loading rules. Invalid rules are skipped. */
  errors: string[];
}

export interface Violation {
  ruleId: string;
  type: RuleType;
  severity: Severity;
  file: string;
  line?: number;
  /** What triggered the rule, e.g. the import specifier or the matched text. */
  detail: string;
  message?: string;
  source: string;
}
