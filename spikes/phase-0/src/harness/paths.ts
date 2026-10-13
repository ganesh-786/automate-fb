import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_MARKER = '.node-version';

/** A path relative to the repository root, with forward slashes on every platform. */
export function repoRelative(repoRoot: string, path: string): string {
  return relative(repoRoot, path).split(sep).join('/');
}

/** Walks up from `from` to the repository root, the directory that holds `.node-version`. */
export function findRepoRoot(from: string = dirname(fileURLToPath(import.meta.url))): string {
  let current = from;
  for (;;) {
    if (existsSync(join(current, ROOT_MARKER))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error(`Repository root not found above ${from}`);
    current = parent;
  }
}

export interface DataPaths {
  repoRoot: string;
  /** One sub-directory per spike, holding its report and artifacts. */
  phaseDir: string;
  cacheDir: string;
}

export function resolveDataPaths(repoRoot: string): DataPaths {
  const dataDir = join(repoRoot, 'data');
  return { repoRoot, phaseDir: join(dataDir, 'phase-0'), cacheDir: join(dataDir, 'cache') };
}
