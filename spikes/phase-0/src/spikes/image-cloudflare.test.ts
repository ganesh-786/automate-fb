import { describe, expect, it } from 'vitest';
import { jsonResponse, scriptedFetch, sentHeaders, testContext } from '../harness/testing.ts';
import { HttpError } from '../lib/http.ts';
import { encodePngRgb, paintScenePlate } from '../lib/png.ts';
import { decodeImageResponse, imageCloudflare, parseSize } from './image-cloudflare.ts';

const env = { CLOUDFLARE_ACCOUNT_ID: 'account-123', CLOUDFLARE_API_TOKEN: 'cf-token-123456' };
const PALETTE = { top: [20, 30, 60], bottom: [200, 120, 40], glow: [255, 240, 200] } as const;

/** A real PNG of the given size. The grain keeps it too large to be mistaken for an empty image. */
function png(width: number, height: number): Buffer {
  return encodePngRgb(width, height, paintScenePlate(width, height, PALETTE, 1));
}

const options = new Map([['size', '272x480']]);

describe('parseSize', () => {
  it('defaults to a 9:16 size', () => {
    const { width, height } = parseSize(undefined);
    expect(width / height).toBeCloseTo(9 / 16);
  });

  it('rejects sizes outside the model range and malformed values', () => {
    expect(() => parseSize('100x200')).toThrow(/WIDTHxHEIGHT/);
    expect(() => parseSize('1080x2000')).toThrow(/WIDTHxHEIGHT/);
    expect(() => parseSize('wide')).toThrow(/WIDTHxHEIGHT/);
  });
});

describe('decodeImageResponse', () => {
  it('reads a base64 image from the JSON envelope', async () => {
    const image = png(8, 8);
    const decoded = await decodeImageResponse(
      jsonResponse({ success: true, result: { image: image.toString('base64') } }),
    );
    expect(decoded.equals(image)).toBe(true);
  });

  it('reads a raw image body', async () => {
    const image = png(8, 8);
    const response = new Response(new Uint8Array(image), {
      headers: { 'content-type': 'image/png' },
    });
    expect((await decodeImageResponse(response)).equals(image)).toBe(true);
  });

  it('reports the provider error when no image comes back', async () => {
    const response = jsonResponse({ success: false, errors: [{ message: 'model unavailable' }] });
    await expect(decodeImageResponse(response)).rejects.toThrow('model unavailable');
  });
});

describe('imageCloudflare', () => {
  it('posts a multipart request and accepts an image of the requested size', async () => {
    const image = png(272, 480);
    const { fetch, calls } = scriptedFetch([
      () => jsonResponse({ success: true, result: { image: image.toString('base64') } }),
    ]);

    const outcome = await imageCloudflare.run(await testContext({ env, fetch, options }));

    expect(outcome.status).toBe('passed');
    expect(outcome.metrics).toMatchObject({ width: 272, height: 480, format: 'png' });

    const call = calls[0];
    expect(call?.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/black-forest-labs/flux-2-klein-4b',
    );
    expect(sentHeaders(call!).get('authorization')).toBe(`Bearer ${env.CLOUDFLARE_API_TOKEN}`);
    // fetch must set the multipart boundary itself, so no content-type may be forced.
    expect(sentHeaders(call!).has('content-type')).toBe(false);

    const form = call?.init?.body;
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('width')).toBe('272');
    expect((form as FormData).get('height')).toBe('480');
    expect((form as FormData).get('prompt')).toEqual(expect.stringContaining('honey'));
  });

  it('fails when the image comes back at a different size', async () => {
    const { fetch } = scriptedFetch([
      () => jsonResponse({ result: { image: png(480, 480).toString('base64') } }),
    ]);

    const outcome = await imageCloudflare.run(await testContext({ env, fetch, options }));

    expect(outcome.status).toBe('failed');
    expect(outcome.summary).toContain('the image is 480x480, not 272x480');
  });

  it('surfaces an API error with its status', async () => {
    const { fetch } = scriptedFetch([
      () => jsonResponse({ success: false, errors: [{ message: 'Authentication error' }] }, 401),
    ]);
    const error: unknown = await imageCloudflare
      .run(await testContext({ env, fetch, options }))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(401);
    expect((error as HttpError).message).not.toContain(env.CLOUDFLARE_API_TOKEN);
  });
});
