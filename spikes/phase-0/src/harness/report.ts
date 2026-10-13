import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, totalmem } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const REPORT_FILE = 'report.json';

export const SpikeReportSchema = z.object({
  spikeId: z.string(),
  title: z.string(),
  risk: z.string(),
  exitCriterion: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  summary: z.string(),
  metrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  artifacts: z.array(z.string()),
  notes: z.array(z.string()),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
  environment: z.object({
    node: z.string(),
    platform: z.string(),
    arch: z.string(),
    cpu: z.string(),
    logicalCores: z.number().int(),
    totalMemoryGb: z.number(),
  }),
});
export type SpikeReport = z.infer<typeof SpikeReportSchema>;

/** The machine a measurement was taken on; timings mean nothing without it. */
export function describeEnvironment(): SpikeReport['environment'] {
  const processors = cpus();
  return {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: processors[0]?.model.trim() ?? 'unknown',
    logicalCores: processors.length,
    totalMemoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
  };
}

export async function writeReport(dir: string, report: SpikeReport): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, REPORT_FILE);
  await writeFile(file, `${JSON.stringify(SpikeReportSchema.parse(report), null, 2)}\n`, 'utf8');
  return file;
}
