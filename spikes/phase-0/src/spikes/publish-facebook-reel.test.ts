import { createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedCall } from '../harness/testing.ts';
import {
  jsonResponse,
  scriptedFetch,
  sentHeaders,
  sentJson,
  testContext,
} from '../harness/testing.ts';
import type { SpikeContext } from '../harness/types.ts';
import { createFacebookReelSpike } from './publish-facebook-reel.ts';

const TOKEN = 'page-token-abcdef123456';
const env = { META_PAGE_ID: '1122334455', META_PAGE_ACCESS_TOKEN: TOKEN };
const VIDEO_BYTES = 2048;
const UPLOAD_URL = 'https://rupload.facebook.com/video-upload/v25.0/987654';

const spike = createFacebookReelSpike(() => Promise.resolve());

const page = () => jsonResponse({ id: env.META_PAGE_ID, name: 'Test Page' });
const session =
  (uploadUrl = UPLOAD_URL) =>
  () =>
    jsonResponse({ video_id: '987654', upload_url: uploadUrl });
const ok = () => jsonResponse({ success: true });
const status =
  (phases: Record<string, unknown>, videoStatus = 'processing') =>
  () =>
    jsonResponse({ status: { video_status: videoStatus, ...phases } });

async function contextWithVideo(overrides: Partial<SpikeContext>): Promise<SpikeContext> {
  const ctx = await testContext(overrides);
  const videoPath = join(ctx.runDir, 'clip.mp4');
  await writeFile(videoPath, Buffer.alloc(VIDEO_BYTES, 1));
  return { ...ctx, options: new Map([['video', videoPath]]) };
}

const pathOf = (call: RecordedCall): string => new URL(call.url).pathname;

describe('publishFacebookReel', () => {
  it('saves a draft by default and never asks for a public post', async () => {
    const { fetch, calls } = scriptedFetch([
      page,
      session(),
      ok,
      ok,
      status({
        uploading_phase: { status: 'complete' },
        processing_phase: { status: 'in_progress' },
      }),
      status({ processing_phase: { status: 'complete' } }, 'ready'),
    ]);

    const outcome = await spike.run(await contextWithVideo({ env, fetch }));

    expect(outcome.status).toBe('passed');
    expect(outcome.metrics).toMatchObject({
      mode: 'draft',
      videoId: '987654',
      videoStatus: 'ready',
    });
    expect(outcome.summary).toContain('Public visibility is not tested');

    const [lookup, start, upload, finish, firstPoll] = calls;
    expect(pathOf(lookup!)).toBe('/v25.0/1122334455');

    expect(pathOf(start!)).toBe('/v25.0/1122334455/video_reels');
    expect(sentJson(start!)).toEqual({ upload_phase: 'start', access_token: TOKEN });

    expect(upload?.url).toBe(UPLOAD_URL);
    const uploadHeaders = sentHeaders(upload!);
    expect(uploadHeaders.get('authorization')).toBe(`OAuth ${TOKEN}`);
    expect(uploadHeaders.get('offset')).toBe('0');
    expect(uploadHeaders.get('file_size')).toBe(String(VIDEO_BYTES));
    expect((upload?.init?.body as Blob).size).toBe(VIDEO_BYTES);

    expect(sentJson(finish!)).toEqual({
      upload_phase: 'finish',
      video_id: '987654',
      video_state: 'DRAFT',
      description: 'Pipeline connectivity test.',
      is_ai_generated: true,
      access_token: TOKEN,
    });

    expect(pathOf(firstPoll!)).toBe('/v25.0/987654');
    expect(new URL(firstPoll!.url).searchParams.get('fields')).toBe('status');
    expect(calls).toHaveLength(6);
  });

  it('publishes only with --publish, waits for the publishing phase and returns the link', async () => {
    const { fetch, calls } = scriptedFetch([
      page,
      session(),
      ok,
      ok,
      status({
        processing_phase: { status: 'complete' },
        publishing_phase: { status: 'not_started' },
      }),
      status({ publishing_phase: { status: 'complete' } }, 'ready'),
      () => jsonResponse({ permalink_url: '/reel/987654/' }),
    ]);

    const outcome = await spike.run(
      await contextWithVideo({ env, fetch, flags: new Set(['publish']) }),
    );

    expect(sentJson(calls[3]!)).toMatchObject({ video_state: 'PUBLISHED' });
    expect(outcome.metrics).toMatchObject({
      mode: 'published',
      permalink: 'https://www.facebook.com/reel/987654/',
    });
    expect(outcome.notes.join(' ')).toContain('private browser window');
  });

  it('signs every Graph call when the app secret is set', async () => {
    const secret = 'app-secret-xyz';
    const proof = createHmac('sha256', secret).update(TOKEN).digest('hex');
    const { fetch, calls } = scriptedFetch([
      page,
      session(),
      ok,
      ok,
      status({ processing_phase: { status: 'complete' } }),
    ]);

    await spike.run(await contextWithVideo({ env: { ...env, META_APP_SECRET: secret }, fetch }));

    expect(new URL(calls[0]!.url).searchParams.get('appsecret_proof')).toBe(proof);
    expect(sentJson(calls[1]!)).toMatchObject({ appsecret_proof: proof });
    expect(sentJson(calls[3]!)).toMatchObject({ appsecret_proof: proof });
  });

  it('refuses to send the token to an upload host that is not Meta', async () => {
    const { fetch, calls } = scriptedFetch([page, session('https://evil.example/upload/1')]);

    await expect(spike.run(await contextWithVideo({ env, fetch }))).rejects.toThrow(
      'unexpected host "evil.example"',
    );
    expect(calls).toHaveLength(2); // nothing was sent after the session response
  });

  it('reports the reason when Meta rejects the video', async () => {
    const { fetch } = scriptedFetch([
      page,
      session(),
      ok,
      ok,
      status({
        processing_phase: { status: 'error', error: { message: 'Resolution too low.' } },
      }),
    ]);

    await expect(spike.run(await contextWithVideo({ env, fetch }))).rejects.toThrow(
      'Meta rejected the video: Resolution too low.',
    );
  });

  it('explains what to do when there is no video to upload', async () => {
    const { fetch } = scriptedFetch([]);
    await expect(spike.run(await testContext({ env, fetch }))).rejects.toThrow(
      'Run render-remotion first',
    );
  });
});
