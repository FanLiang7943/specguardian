const cache = new Map<string, RegExp>();

/**
 * Converts a glob into an anchored RegExp matched against POSIX-style relative paths.
 * Supports `**`, `*`, `?` and `{a,b}`. A pattern without `/` matches at any depth.
 * A trailing `/**` also matches the directory itself.
 */
export function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) return cached;

  let pattern = glob.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!pattern.includes("/")) pattern = `**/${pattern}`;

  let re = "";
  let braceDepth = 0;
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        const atSegmentStart = i === 0 || pattern[i - 1] === "/";
        const next = pattern[i + 2];
        if (atSegmentStart && next === "/") {
          re += "(?:.*/)?";
          i += 3;
          continue;
        }
        if (atSegmentStart && next === undefined && re.endsWith("/")) {
          re = `${re.slice(0, -1)}(?:/.*)?`;
          i += 2;
          continue;
        }
        re += ".*";
        i += 2;
        continue;
      }
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      braceDepth++;
      re += "(?:";
    } else if (c === "}" && braceDepth > 0) {
      braceDepth--;
      re += ")";
    } else if (c === "," && braceDepth > 0) {
      re += "|";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    i += 1;
  }

  const compiled = new RegExp(`^${re}$`);
  cache.set(glob, compiled);
  return compiled;
}

export function matchGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path.replace(/\\/g, "/"));
}

export function matchesAny(path: string, globs: readonly string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  return globs.some((g) => matchGlob(path, g));
}

export function isGlob(value: string): boolean {
  return /[*?{]/.test(value);
}
