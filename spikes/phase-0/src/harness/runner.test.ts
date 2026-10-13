import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_FILE, SpikeReportSchema } from './report.ts';
import type { RunnerDeps } from './runner.ts';
import { missingEnv, runSpike } from './runner.ts';
import { tempDir } from './testing.ts';
import type { Spike } from './types.ts';

const SECRET = 'super-secret-token-123';

async function deps(env: Record<string, string> = {}): Promise<RunnerDeps> {
  const root = await tempDir('runner');
  return {
    repoRoot: root,
    phaseDir: join(root, 'phase-0'),
    cacheDir: join(root, 'cache'),
    env,
    flags: new Set(),
    options: new Map(),
    fetch: () => Promise.reject(new Error('network is disabled in tests')),
    log: () => undefined,
  };
}

function spike(overrides: Partial<Spike> = {}): Spike {
  return {
    id: 'sample',
    title: 'Sample spike',
    risk: 'Something might not work.',
    exitCriterion: 'It works.',
    requiredEnv: [],
    run: () =>
      Promise.resolve({ status: 'passed', summary: 'ok', metrics: {}, artifacts: [], notes: [] }),
    ...overrides,
  };
}

describe('missingEnv', () => {
  it('treats blank values as missing', () => {
    expect(missingEnv({ requiredEnv: ['A', 'B', 'C'] }, { A: 'set', B: '  ' })).toEqual(['B', 'C']);
  });
});

describe('runSpike', () => {
  it('writes a schema-valid report for a passing spike', async () => {
    const runnerDeps = await deps();
    const report = await runSpike(
      spike({
        run: () =>
          Promise.resolve({
            status: 'passed',
            summary: 'all good',
            metrics: { seconds: 1.5, fast: true },
            artifacts: ['data/phase-0/sample/out.txt'],
            notes: ['a note'],
          }),
      }),
      runnerDeps,
    );

    expect(report.status).toBe('passed');
    expect(report.metrics).toEqual({ seconds: 1.5, fast: true });

    const file = join(runnerDeps.phaseDir, 'sample', REPORT_FILE);
    const onDisk = SpikeReportSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    expect(onDisk).toEqual(report);
  });

  it('skips when credentials are missing and leaves earlier evidence untouched', async () => {
    const runnerDeps = await deps();
    await runSpike(spike(), runnerDeps);
    const evidence = join(runnerDeps.phaseDir, 'sample', REPORT_FILE);
    const before = await readFile(evidence, 'utf8');

    let ran = false;
    const report = await runSpike(
      spike({
        requiredEnv: ['GEMINI_API_KEY'],
        run: () => {
          ran = true;
          return Promise.reject(new Error('should not run'));
        },
      }),
      runnerDeps,
    );

    expect(ran).toBe(false);
    expect(report.status).toBe('skipped');
    expect(report.summary).toContain('GEMINI_API_KEY');
    expect(await readFile(evidence, 'utf8')).toBe(before);
  });

  it('reports a thrown error as a failure', async () => {
    const report = await runSpike(
      spike({ run: () => Promise.reject(new RangeError('boom')) }),
      await deps(),
    );
    expect(report.status).toBe('failed');
    expect(report.summary).toBe('RangeError: boom');
  });

  it('redacts secrets from summaries, notes, metrics and log lines', async () => {
    const lines: string[] = [];
    const runnerDeps = {
      ...(await deps({ BUFFER_API_KEY: SECRET })),
      log: (m: string) => lines.push(m),
    };
    const report = await runSpike(
      spike({
        run: (ctx) => {
          ctx.log(`calling with ${SECRET}`);
          return Promise.resolve({
            status: 'failed',
            summary: `server echoed ${SECRET}`,
            metrics: { header: `Bearer ${SECRET}` },
            artifacts: [],
            notes: [`token was ${SECRET}`],
          });
        },
      }),
      runnerDeps,
    );

    const everything = JSON.stringify(report) + lines.join('\n');
    expect(everything).not.toContain(SECRET);
    expect(report.summary).toBe('server echoed [redacted]');
  });

  it('empties the run directory before each run and resolves earlier artifacts', async () => {
    const runnerDeps = await deps();
    const stale = join(runnerDeps.phaseDir, 'sample', 'stale.txt');

    await runSpike(
      spike({
        run: async (ctx) => {
          await writeFile(join(ctx.runDir, 'stale.txt'), 'old');
          return { status: 'passed', summary: 'ok', metrics: {}, artifacts: [], notes: [] };
        },
      }),
      runnerDeps,
    );
    expect(existsSync(stale)).toBe(true);

    let found: string | undefined;
    await runSpike(
      spike({
        id: 'consumer',
        run: (ctx) => {
          found = ctx.findArtifact('sample', 'stale.txt');
          return Promise.resolve({
            status: 'passed',
            summary: 'ok',
            metrics: {},
            artifacts: [],
            notes: [],
          });
        },
      }),
      runnerDeps,
    );
    expect(found).toBe(stale);

    await runSpike(spike(), runnerDeps);
    expect(existsSync(stale)).toBe(false);
  });
});
