import path from "node:path";

export type Language = "js" | "python";

export interface ImportRef {
  specifier: string;
  line: number;
}

const JS_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".astro"];
const PY_EXTENSIONS = [".py", ".pyi"];

export function languageOf(file: string): Language | null {
  const ext = path.extname(file).toLowerCase();
  if (JS_EXTENSIONS.includes(ext)) return "js";
  if (PY_EXTENSIONS.includes(ext)) return "python";
  return null;
}

const JS_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"'\n]+)["']/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];

export function extractImports(file: string, content: string): ImportRef[] {
  const lang = languageOf(file);
  if (lang === "js") return extractJsImports(content);
  if (lang === "python") return extractPythonImports(content);
  return [];
}

function extractJsImports(content: string): ImportRef[] {
  const code = stripJsComments(content);
  const lineStarts = computeLineStarts(code);
  const found = new Map<number, ImportRef>();
  for (const re of JS_PATTERNS) {
    for (const m of code.matchAll(re)) {
      const index = (m.index ?? 0) + m[0].lastIndexOf(m[1]);
      if (!found.has(index)) found.set(index, { specifier: m[1], line: lineAt(lineStarts, index) });
    }
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([, ref]) => ref);
}

function extractPythonImports(content: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((raw, i) => {
    const text = raw.replace(/#.*$/, "");
    const from = /^\s*from\s+(\.*[\w.]*)\s+import\b/.exec(text);
    if (from) {
      refs.push({ specifier: from[1], line: i + 1 });
      return;
    }
    const imp = /^\s*import\s+(.+)$/.exec(text);
    if (imp) {
      for (const part of imp[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (/^[\w.]+$/.test(name)) refs.push({ specifier: name, line: i + 1 });
      }
    }
  });
  return refs;
}

/** Blanks out comments while keeping strings and line breaks intact. */
export function stripJsComments(code: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) {
        if (code[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

function lineAt(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Returns repo-relative paths an import may point to, for matching `boundary` rules.
 * Bare specifiers are returned as-is (after alias rewriting) so rules can target them too.
 */
export function resolveImportCandidates(
  fromFile: string,
  specifier: string,
  aliases: Record<string, string>,
): string[] {
  const lang = languageOf(fromFile);
  const dir = path.posix.dirname(fromFile);
  let base: string | null = null;
  const out = new Set<string>([specifier]);

  if (lang === "python") {
    const dots = /^\.*/.exec(specifier)?.[0].length ?? 0;
    const modulePath = specifier.slice(dots).replace(/\./g, "/");
    if (dots > 0) {
      let start = dir;
      for (let i = 1; i < dots; i++) start = path.posix.dirname(start);
      base = path.posix.normalize(modulePath ? `${start}/${modulePath}` : start);
    } else {
      base = modulePath;
    }
    if (base) for (const s of ["", ".py", "/__init__.py"]) out.add(`${base}${s}`);
    return [...out];
  }

  if (specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === "..") {
    base = path.posix.normalize(`${dir}/${specifier}`);
  } else {
    for (const [prefix, target] of Object.entries(aliases)) {
      if (specifier.startsWith(prefix)) {
        base = path.posix.normalize(`${target}${specifier.slice(prefix.length)}`);
        break;
      }
    }
  }
  if (base) {
    out.add(base);
    for (const ext of JS_EXTENSIONS) {
      out.add(`${base}${ext}`);
      out.add(`${base}/index${ext}`);
    }
  }
  return [...out];
}
