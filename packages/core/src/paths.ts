import { existsSync, statSync } from "node:fs";
import path from "node:path";

export const SPECGUARDIAN_DIR = ".specguardian";

export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Walks up from `start` and returns the first directory that contains `.specguardian/`. */
export function findProjectRoot(start: string): string | null {
  let dir = path.resolve(start);
  if (existsSync(dir) && !statSync(dir).isDirectory()) dir = path.dirname(dir);
  for (;;) {
    if (existsSync(path.join(dir, SPECGUARDIAN_DIR))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Returns the POSIX path of `file` relative to `root`, or null when it lies outside `root`. */
export function relativeToRoot(root: string, file: string): string | null {
  const rel = path.relative(path.resolve(root), path.resolve(root, file));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return toPosix(rel);
}
