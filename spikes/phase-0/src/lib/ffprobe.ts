import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const ProbeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      pix_fmt: z.string().optional(),
      color_range: z.string().optional(),
      color_space: z.string().optional(),
      r_frame_rate: z.string().optional(),
      sample_rate: z.string().optional(),
      channels: z.number().optional(),
    }),
  ),
  format: z.object({
    duration: z.string(),
    size: z.string(),
    bit_rate: z.string().optional(),
  }),
});
export type Probe = z.infer<typeof ProbeSchema>;

/**
 * Path of the Remotion command-line script. Remotion ships its own ffprobe binary, so probing
 * needs no system-wide FFmpeg install.
 */
function remotionCliPath(): string {
  const packageJsonPath = createRequire(import.meta.url).resolve('@remotion/cli/package.json');
  const manifest = z
    .object({ bin: z.object({ remotion: z.string() }) })
    .parse(JSON.parse(readFileSync(packageJsonPath, 'utf8')));
  return join(dirname(packageJsonPath), manifest.bin.remotion);
}

/** Reads container and stream metadata from a media file. */
export async function probeMedia(path: string): Promise<Probe> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      remotionCliPath(),
      'ffprobe',
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      path,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const start = stdout.indexOf('{');
  if (start === -1) throw new Error('ffprobe printed no JSON');
  return ProbeSchema.parse(JSON.parse(stdout.slice(start)));
}

/** Converts a rational such as "30/1" or "30000/1001" to frames per second. */
export function parseFrameRate(rational: string): number {
  const [numerator, denominator = '1'] = rational.split('/');
  return Number(numerator) / Number(denominator);
}
