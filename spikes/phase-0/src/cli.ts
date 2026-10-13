import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { findRepoRoot, resolveDataPaths } from './harness/paths.ts';
import type { SpikeReport } from './harness/report.ts';
import { missingEnv, runSpike } from './harness/runner.ts';
import { GROUPS, SPIKES, selectSpikes } from './registry.ts';

const USAGE = `Phase 0 risk spikes

Usage: npm run spike -- [spike-or-group ...] [options]

  With no names, every spike runs. Spikes whose credentials are missing are skipped.

Groups:   ${Object.keys(GROUPS).join(', ')}
Spikes:   ${SPIKES.map((spike) => spike.id).join(', ')}

Options:
  --list              Show each spike, what it proves and what it still needs
  --set name=value    Pass an option to the spikes (repeatable), e.g. --set seconds=60
  --publish           Let publish-facebook-reel publish publicly instead of saving a draft
  -h, --help          Show this help
`;

function parseSettings(pairs: readonly string[]): Map<string, string> {
  const settings = new Map<string, string>();
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator < 1) throw new Error(`--set expects name=value, got "${pair}".`);
    settings.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return settings;
}

function printList(env: NodeJS.ProcessEnv): void {
  for (const spike of SPIKES) {
    const missing = missingEnv(spike, env);
    console.log(`\n${spike.id}  -  ${spike.title}`);
    console.log(`  Risk:  ${spike.risk}`);
    console.log(`  Done:  ${spike.exitCriterion}`);
    console.log(`  Needs: ${missing.length === 0 ? 'nothing, ready to run' : missing.join(', ')}`);
  }
}

function printSummary(reports: readonly SpikeReport[]): void {
  const idWidth = Math.max(...reports.map((report) => report.spikeId.length));
  console.log('\nSummary');
  for (const report of reports) {
    console.log(
      `  ${report.status.toUpperCase().padEnd(7)}  ${report.spikeId.padEnd(idWidth)}  ${report.summary}`,
    );
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      list: { type: 'boolean', default: false },
      publish: { type: 'boolean', default: false },
      set: { type: 'string', multiple: true, default: [] },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const paths = resolveDataPaths(findRepoRoot());
  const envFile = join(paths.repoRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  if (values.list) {
    printList(process.env);
    return 0;
  }

  const spikes = selectSpikes(positionals);
  const options = parseSettings(values.set);
  const flags = new Set(values.publish ? ['publish'] : []);

  const reports: SpikeReport[] = [];
  for (const spike of spikes) {
    console.log(`\n== ${spike.id}: ${spike.title}`);
    const report = await runSpike(spike, {
      ...paths,
      env: process.env,
      flags,
      options,
      fetch: globalThis.fetch,
      log: (message) => console.log(`   ${message}`),
    });
    console.log(`   ${report.status.toUpperCase()}: ${report.summary}`);
    reports.push(report);
  }

  await mkdir(paths.phaseDir, { recursive: true });
  await writeFile(
    join(paths.phaseDir, 'last-run.json'),
    `${JSON.stringify(reports, null, 2)}\n`,
    'utf8',
  );
  printSummary(reports);
  return reports.some((report) => report.status === 'failed') ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
