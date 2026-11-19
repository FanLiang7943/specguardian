import YAML from "yaml";

const BLOCK_RE = /^(```|~~~)[ \t]*specguardian\b[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm;

/**
 * Extracts rules from fenced ```specguardian blocks in a markdown document.
 * A block may contain a single rule, a list of rules, or `{ rules: [...] }`.
 */
export function extractRuleBlocks(markdown: string): { rules: unknown[]; errors: string[] } {
  const rules: unknown[] = [];
  const errors: string[] = [];
  const text = markdown.replace(/\r\n/g, "\n");
  for (const match of text.matchAll(BLOCK_RE)) {
    const line = text.slice(0, match.index).split("\n").length;
    let parsed: unknown;
    try {
      parsed = YAML.parse(match[2]);
    } catch (err) {
      errors.push(`line ${line}: invalid YAML in specguardian block (${(err as Error).message})`);
      continue;
    }
    if (Array.isArray(parsed)) rules.push(...parsed);
    else if (parsed && typeof parsed === "object" && "rules" in parsed) {
      const inner = (parsed as { rules: unknown }).rules;
      if (Array.isArray(inner)) rules.push(...inner);
      else rules.push(inner);
    } else if (parsed !== null && parsed !== undefined) rules.push(parsed);
  }
  return { rules, errors };
}
