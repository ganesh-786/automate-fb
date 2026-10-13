import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';
import type { SpikeContext } from './types.ts';

export interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

type Responder = (call: RecordedCall) => Response;

/** A fetch stand-in that answers calls from a fixed script and records what was asked. */
export function scriptedFetch(responders: readonly Responder[]): {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const queue = [...responders];
  const fetchFn: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call: RecordedCall = { url, init };
    calls.push(call);
    const responder = queue.shift();
    if (!responder) return Promise.reject(new Error(`Unexpected request to ${url}`));
    return Promise.resolve(responder(call));
  };
  return { fetch: fetchFn, calls };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The JSON body a recorded call was sent with. */
export function sentJson(call: RecordedCall): unknown {
  const body = call.init?.body;
  if (typeof body !== 'string') throw new Error('request body was not a JSON string');
  return JSON.parse(body) as unknown;
}

export function sentHeaders(call: RecordedCall): Headers {
  return new Headers(call.init?.headers);
}

/** A fresh temporary directory outside the repository, removed when the current test ends. */
export async function tempDir(label: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `automate-${label}-`));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

/** A context backed by a fresh temporary directory, with the network disabled by default. */
export async function testContext(overrides: Partial<SpikeContext> = {}): Promise<SpikeContext> {
  const runDir = await tempDir('spike');
  return {
    runDir,
    cacheDir: runDir,
    repoRoot: runDir,
    env: {},
    flags: new Set(),
    options: new Map(),
    fetch: () => Promise.reject(new Error('network is disabled in tests')),
    log: () => undefined,
    findArtifact: () => undefined,
    ...overrides,
  };
}
