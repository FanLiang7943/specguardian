import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { matchesAny } from "./glob.js";

export function readTextIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

export function readJsonFile<T>(file: string, fallback: T): T {
  const text = readTextIfExists(file);
  if (text === null || text.trim() === "") return fallback;
  return JSON.parse(text) as T;
}

export function writeJsonFile(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function writeTextFile(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

/** Recursively lists files under `root` as POSIX relative paths, skipping excluded paths. */
export function walkFiles(root: string, exclude: readonly string[]): string[] {
  const out: string[] = [];
  const visit = (relDir: string): void => {
    const absDir = relDir ? path.join(root, relDir) : root;
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (matchesAny(rel, exclude)) continue;
      if (entry.isDirectory()) visit(rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  visit("");
  return out.sort();
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
