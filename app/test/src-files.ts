// Shared test helpers for source-scan guards (design roadmap). Lives outside
// src/ so vitest's `src/**/*.test.ts` include never runs it and the scans
// never see it.
import { readdirSync, readFileSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url);

/**
 * Every file under app/src ending in one of `exts`, with `rel` relative to
 * app/src (forward slashes). Test files are skipped: a guard's own regex
 * literals would otherwise match themselves.
 */
export function srcFiles(exts: string[]): { rel: string; text: string }[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .map((p) => p.split('\\').join('/'))
    .filter((rel) => exts.some((e) => rel.endsWith(e)) && !/\.test\.tsx?$/.test(rel))
    .sort()
    .map((rel) => ({ rel, text: readSrc(rel) }));
}

export function readSrc(rel: string): string {
  return readFileSync(new URL(rel, SRC), 'utf8');
}
