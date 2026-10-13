import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { repoRelative } from '../harness/paths.ts';
import type { Spike } from '../harness/types.ts';
import { HttpError } from '../lib/http.ts';
import { readImageInfo } from '../lib/image-size.ts';

/**
 * Cloudflare Workers AI. The request shape was taken from
 * https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/
 * on 2026-10-13. That page does not show the response, so both a JSON envelope and a raw image
 * body are accepted.
 */
const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const REQUEST_TIMEOUT_MS = 180_000;

/** 9:16 with both sides a multiple of 16, inside the model's 256-1920 range. */
const DEFAULT_WIDTH = 864;
const DEFAULT_HEIGHT = 1536;
const MIN_SIDE = 256;
const MAX_SIDE = 1920;

/** Workers AI pricing page, 2026-10-13: 26.05 neurons per 512x512 output tile. */
const NEURONS_PER_OUTPUT_TILE = 26.05;
const TILE_PIXELS = 512 * 512;
const FREE_NEURONS_PER_DAY = 10_000;

/** Anything smaller cannot be a real image at this resolution. */
const MIN_IMAGE_BYTES = 10_000;

const PROMPT =
  'A glowing glass jar of golden honey on a rustic wooden table, warm morning sunlight, ' +
  'shallow depth of field, macro photography, rich detail, vertical composition';

const EnvelopeSchema = z.object({
  success: z.boolean().optional(),
  result: z.object({ image: z.string() }).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export function parseSize(value: string | undefined): { width: number; height: number } {
  if (value === undefined) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const match = /^(\d+)x(\d+)$/.exec(value);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  const valid = (side: number): boolean =>
    Number.isInteger(side) && side >= MIN_SIDE && side <= MAX_SIDE;
  if (!valid(width) || !valid(height)) {
    throw new Error(`--set size expects WIDTHxHEIGHT with sides from ${MIN_SIDE} to ${MAX_SIDE}.`);
  }
  return { width, height };
}

/** Image bytes from either response style: a raw image body or `{ result: { image: base64 } }`. */
export async function decodeImageResponse(response: Response): Promise<Buffer> {
  if (response.headers.get('content-type')?.startsWith('image/')) {
    return Buffer.from(await response.arrayBuffer());
  }
  const envelope = EnvelopeSchema.parse(await response.json());
  if (!envelope.result) {
    const reason = envelope.errors?.map((error) => error.message).join('; ') ?? 'no image returned';
    throw new Error(`Workers AI returned no image: ${reason}`);
  }
  return Buffer.from(envelope.result.image, 'base64');
}

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

export const imageCloudflare: Spike = {
  id: 'image-cloudflare',
  title: 'Native 9:16 image from FLUX.2 klein on Cloudflare Workers AI',
  risk: 'The free tier may not serve this model, or may not return vertical images at the size asked for.',
  exitCriterion: 'One request returns a decodable image at exactly the requested 9:16 size.',
  requiredEnv: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],

  async run(ctx) {
    const accountId = ctx.env.CLOUDFLARE_ACCOUNT_ID ?? '';
    const token = ctx.env.CLOUDFLARE_API_TOKEN ?? '';
    const { width, height } = parseSize(ctx.options.get('size'));

    const form = new FormData();
    form.append('prompt', PROMPT);
    form.append('width', String(width));
    form.append('height', String(height));

    ctx.log(`Requesting a ${width}x${height} image from ${MODEL}`);
    const started = performance.now();
    // No content-type header: fetch must generate it so that it carries the multipart boundary.
    const response = await ctx.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODEL}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new HttpError('Workers AI image request', response.status, await response.text());
    }
    const bytes = await decodeImageResponse(response);
    const latencySeconds = (performance.now() - started) / 1000;

    const info = readImageInfo(bytes);
    const extension = info?.format === 'png' ? 'png' : 'jpg';
    const imagePath = join(ctx.runDir, `image.${extension}`);
    await writeFile(imagePath, bytes);

    const estimatedNeurons = (NEURONS_PER_OUTPUT_TILE * width * height) / TILE_PIXELS;
    const problems: string[] = [];
    if (!info) problems.push('the response is not a PNG or JPEG');
    else if (info.width !== width || info.height !== height) {
      problems.push(`the image is ${info.width}x${info.height}, not ${width}x${height}`);
    }
    if (bytes.length < MIN_IMAGE_BYTES) problems.push(`the image is only ${bytes.length} bytes`);

    const outcome = `${info ? `${info.width}x${info.height} ${info.format}` : 'unreadable image'} in ${round(latencySeconds, 1)} s`;
    return {
      status: problems.length === 0 ? 'passed' : 'failed',
      summary: problems.length === 0 ? outcome : `${outcome}; ${problems.join('; ')}`,
      metrics: {
        model: MODEL,
        requestedWidth: width,
        requestedHeight: height,
        width: info?.width ?? 0,
        height: info?.height ?? 0,
        format: info?.format ?? 'unknown',
        latencySeconds: round(latencySeconds, 2),
        kilobytes: Math.round(bytes.length / 1024),
        estimatedNeurons: round(estimatedNeurons, 1),
        estimatedImagesPerFreeDay: Math.floor(FREE_NEURONS_PER_DAY / estimatedNeurons),
      },
      artifacts: [repoRelative(ctx.repoRoot, imagePath)],
      notes: [
        'Neuron usage is estimated from the published rate. Confirm the real figure in the Cloudflare dashboard under Workers AI.',
      ],
    };
  },
};
