export type SpikeStatus = 'passed' | 'failed' | 'skipped';

export type MetricValue = string | number | boolean;

/** What a spike returns once it has run, whether or not it met its exit criterion. */
export interface SpikeOutcome {
  status: 'passed' | 'failed';
  summary: string;
  metrics: Record<string, MetricValue>;
  /** Files the spike produced, as paths relative to the repository root. */
  artifacts: string[];
  notes: string[];
}

export interface SpikeContext {
  /** Directory owned by this spike. It is emptied before each run. */
  runDir: string;
  /** Long-lived cache shared by all spikes, for example model weights. */
  cacheDir: string;
  repoRoot: string;
  env: Readonly<Record<string, string | undefined>>;
  /** Boolean command-line switches such as `--publish`. */
  flags: ReadonlySet<string>;
  /** `--set name=value` command-line options. */
  options: ReadonlyMap<string, string>;
  fetch: typeof globalThis.fetch;
  log: (message: string) => void;
  /** Absolute path of a file an earlier spike produced, when it exists. */
  findArtifact: (spikeId: string, fileName: string) => string | undefined;
}

export interface Spike {
  id: string;
  title: string;
  /** The project risk this spike exists to retire. */
  risk: string;
  exitCriterion: string;
  /** Environment variables that must be set. The spike is skipped when any is missing. */
  requiredEnv: readonly string[];
  run: (ctx: SpikeContext) => Promise<SpikeOutcome>;
}
