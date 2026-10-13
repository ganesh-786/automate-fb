import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Env } from './env.ts';
import { optionalEnv } from './env.ts';
import { redactSecrets, secretValues } from './redact.ts';
import type { SpikeReport } from './report.ts';
import { describeEnvironment, writeReport } from './report.ts';
import type { MetricValue, Spike, SpikeContext, SpikeOutcome, SpikeStatus } from './types.ts';

export interface RunnerDeps {
  repoRoot: string;
  phaseDir: string;
  cacheDir: string;
  env: Readonly<Record<string, string | undefined>>;
  flags: ReadonlySet<string>;
  options: ReadonlyMap<string, string>;
  fetch: typeof globalThis.fetch;
  log: (message: string) => void;
}

export function missingEnv(spike: Pick<Spike, 'requiredEnv'>, env: Env): string[] {
  return spike.requiredEnv.filter((key) => optionalEnv(env, key) === undefined);
}

/**
 * Runs one spike and returns its report. A spike that throws is reported as failed, and a spike
 * whose credentials are missing is reported as skipped without touching earlier evidence on disk.
 */
export async function runSpike(spike: Spike, deps: RunnerDeps): Promise<SpikeReport> {
  const startedAt = new Date();
  const secrets = secretValues(deps.env);
  const redact = (text: string): string => redactSecrets(text, secrets);

  const finish = (
    status: SpikeStatus,
    outcome: Pick<SpikeOutcome, 'summary' | 'metrics' | 'artifacts' | 'notes'>,
  ): SpikeReport => {
    const finishedAt = new Date();
    const metrics: Record<string, MetricValue> = {};
    for (const [name, value] of Object.entries(outcome.metrics)) {
      metrics[name] = typeof value === 'string' ? redact(value) : value;
    }
    return {
      spikeId: spike.id,
      title: spike.title,
      risk: spike.risk,
      exitCriterion: spike.exitCriterion,
      status,
      summary: redact(outcome.summary),
      metrics,
      artifacts: outcome.artifacts,
      notes: outcome.notes.map(redact),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      environment: describeEnvironment(),
    };
  };

  const missing = missingEnv(spike, deps.env);
  if (missing.length > 0) {
    return finish('skipped', {
      summary: `Not run. Set ${missing.join(', ')} in .env.`,
      metrics: {},
      artifacts: [],
      notes: [],
    });
  }

  const runDir = join(deps.phaseDir, spike.id);
  await rm(runDir, { recursive: true, force: true });
  await mkdir(runDir, { recursive: true });

  const ctx: SpikeContext = {
    runDir,
    cacheDir: deps.cacheDir,
    repoRoot: deps.repoRoot,
    env: deps.env,
    flags: deps.flags,
    options: deps.options,
    fetch: deps.fetch,
    log: (message) => deps.log(redact(message)),
    findArtifact: (spikeId, fileName) => {
      const path = join(deps.phaseDir, spikeId, fileName);
      return existsSync(path) ? path : undefined;
    },
  };

  let report: SpikeReport;
  try {
    const outcome = await spike.run(ctx);
    report = finish(outcome.status, outcome);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    report = finish('failed', { summary: message, metrics: {}, artifacts: [], notes: [] });
  }
  await writeReport(runDir, report);
  return report;
}
