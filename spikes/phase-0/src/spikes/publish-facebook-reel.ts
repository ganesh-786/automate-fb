import { createHmac } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { z } from 'zod';
import { optionalEnv } from '../harness/env.ts';
import { repoRelative } from '../harness/paths.ts';
import type { Spike, SpikeContext } from '../harness/types.ts';
import { requestJson } from '../lib/http.ts';
import { VIDEO_FILE } from './render-remotion.ts';

/**
 * Meta Reels Publishing API: start an upload session, send the file, then finish with a state.
 * Flow taken from https://developers.facebook.com/docs/video-api/guides/reels-publishing and
 * https://developers.facebook.com/docs/graph-api/reference/page/video_reels/ on 2026-10-13.
 */
const GRAPH_ORIGIN = 'https://graph.facebook.com';
const UPLOAD_HOST = 'rupload.facebook.com';
const DEFAULT_GRAPH_VERSION = 'v25.0';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

const DEFAULT_DESCRIPTION = 'Pipeline connectivity test.';

const PageSchema = z.object({ id: z.string(), name: z.string() });
const SessionSchema = z.object({ video_id: z.string(), upload_url: z.string() });
const SuccessSchema = z.object({ success: z.boolean() });
const PhaseSchema = z.object({
  status: z.string(),
  error: z.object({ message: z.string() }).optional(),
});
const StatusSchema = z.object({
  status: z.object({
    video_status: z.string(),
    uploading_phase: PhaseSchema.optional(),
    processing_phase: PhaseSchema.optional(),
    publishing_phase: PhaseSchema.optional(),
  }),
});
const PermalinkSchema = z.object({ permalink_url: z.string().optional() });

type VideoStatus = z.infer<typeof StatusSchema>['status'];
type PhaseName = 'processing_phase' | 'publishing_phase';

interface GraphClient {
  fetch: typeof globalThis.fetch;
  /** Versioned API root, for example https://graph.facebook.com/v25.0 */
  root: string;
  token: string;
  appSecret: string | undefined;
}

/** The access token plus, when the app secret is known, the proof Meta uses to bind them. */
function authFields(client: GraphClient): Record<string, string> {
  const fields: Record<string, string> = { access_token: client.token };
  if (client.appSecret) {
    fields.appsecret_proof = createHmac('sha256', client.appSecret)
      .update(client.token)
      .digest('hex');
  }
  return fields;
}

function graphGet(
  client: GraphClient,
  path: string,
  fields: string,
  label: string,
): Promise<unknown> {
  const query = new URLSearchParams({ fields, ...authFields(client) });
  return requestJson(client.fetch, `${client.root}/${path}?${query}`, { method: 'GET' }, { label });
}

/** Parameters travel in the JSON body, as in Meta's own "start" example, so no token is in a URL. */
function graphPost(
  client: GraphClient,
  path: string,
  parameters: Record<string, unknown>,
  label: string,
): Promise<unknown> {
  return requestJson(
    client.fetch,
    `${client.root}/${path}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...parameters, ...authFields(client) }),
    },
    { label },
  );
}

// Meta's guide uses "complete" in its example and "completed" in its table.
const isComplete = (phase: z.infer<typeof PhaseSchema> | undefined): boolean =>
  phase?.status === 'complete' || phase?.status === 'completed';

async function waitForPhase(
  client: GraphClient,
  videoId: string,
  phase: PhaseName,
  sleep: (ms: number) => Promise<void>,
  log: SpikeContext['log'],
): Promise<VideoStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const { status } = StatusSchema.parse(
      await graphGet(client, videoId, 'status', 'Reel status check'),
    );
    const rejected = [
      status.uploading_phase,
      status.processing_phase,
      status.publishing_phase,
    ].find((candidate) => candidate?.error);
    if (rejected?.error) throw new Error(`Meta rejected the video: ${rejected.error.message}`);
    if (isComplete(status[phase])) return status;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${phase}; video_status was "${status.video_status}".`);
    }
    log(`Waiting for ${phase.replace('_', ' ')} (video_status: ${status.video_status})`);
    await sleep(POLL_INTERVAL_MS);
  }
}

const round = (value: number, digits: number): number => Number(value.toFixed(digits));
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** `sleep` is injectable so tests do not wait between status checks. */
export function createFacebookReelSpike(
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Spike {
  return {
    id: 'publish-facebook-reel',
    title: 'Upload a Reel to a Facebook Page (draft unless --publish)',
    risk: 'A self-owned Meta app may be unable to publish to its own Page without App Review.',
    exitCriterion:
      'Draft mode: the Reel uploads and finishes processing. With --publish: it is published and its link opens in a logged-out browser, which is checked by hand.',
    requiredEnv: ['META_PAGE_ID', 'META_PAGE_ACCESS_TOKEN'],

    async run(ctx) {
      const pageId = ctx.env.META_PAGE_ID ?? '';
      const version = optionalEnv(ctx.env, 'META_GRAPH_VERSION') ?? DEFAULT_GRAPH_VERSION;
      const client: GraphClient = {
        fetch: ctx.fetch,
        root: `${GRAPH_ORIGIN}/${version}`,
        token: ctx.env.META_PAGE_ACCESS_TOKEN ?? '',
        appSecret: optionalEnv(ctx.env, 'META_APP_SECRET'),
      };
      const publish = ctx.flags.has('publish');
      const description = ctx.options.get('description') ?? DEFAULT_DESCRIPTION;

      const videoPath = ctx.options.get('video') ?? ctx.findArtifact('render-remotion', VIDEO_FILE);
      if (!videoPath) {
        throw new Error(
          'No video to upload. Run render-remotion first, or pass --set video=<path>.',
        );
      }
      const video = await openAsBlob(videoPath);

      const page = PageSchema.parse(await graphGet(client, pageId, 'id,name', 'Page lookup'));
      ctx.log(`Token is valid for Page "${page.name}"`);

      const session = SessionSchema.parse(
        await graphPost(
          client,
          `${pageId}/video_reels`,
          { upload_phase: 'start' },
          'Reel upload start',
        ),
      );
      const uploadUrl = new URL(session.upload_url);
      if (uploadUrl.protocol !== 'https:' || uploadUrl.hostname !== UPLOAD_HOST) {
        throw new Error(
          `Refusing to send the Page token to unexpected host "${uploadUrl.hostname}".`,
        );
      }

      ctx.log(`Uploading ${round(video.size / 1024 ** 2, 1)} MB`);
      const uploadStarted = performance.now();
      const uploaded = SuccessSchema.parse(
        await requestJson(
          ctx.fetch,
          uploadUrl.href,
          {
            method: 'POST',
            headers: {
              authorization: `OAuth ${client.token}`,
              offset: '0',
              file_size: String(video.size),
              'content-type': 'application/octet-stream',
            },
            body: video,
          },
          { label: 'Reel file upload', timeoutMs: UPLOAD_TIMEOUT_MS },
        ),
      );
      if (!uploaded.success) throw new Error('Meta did not confirm the file upload.');
      const uploadSeconds = (performance.now() - uploadStarted) / 1000;

      const finished = SuccessSchema.parse(
        await graphPost(
          client,
          `${pageId}/video_reels`,
          {
            upload_phase: 'finish',
            video_id: session.video_id,
            video_state: publish ? 'PUBLISHED' : 'DRAFT',
            description,
            // The test clip is synthetic narration over generated plates, so this is accurate.
            is_ai_generated: true,
          },
          'Reel finish',
        ),
      );
      if (!finished.success) throw new Error('Meta did not accept the finish request.');

      const waitStarted = performance.now();
      const status = await waitForPhase(
        client,
        session.video_id,
        publish ? 'publishing_phase' : 'processing_phase',
        sleep,
        ctx.log,
      );
      const waitSeconds = (performance.now() - waitStarted) / 1000;

      let permalink = '';
      if (publish) {
        const { permalink_url: path } = PermalinkSchema.parse(
          await graphGet(client, session.video_id, 'permalink_url', 'Reel permalink lookup'),
        );
        if (path) permalink = path.startsWith('/') ? `https://www.facebook.com${path}` : path;
      }

      return {
        status: 'passed',
        summary: publish
          ? `Reel published on "${page.name}"${permalink ? `: ${permalink}` : ''}`
          : `Draft Reel ${session.video_id} uploaded to "${page.name}" and processed. Public visibility is not tested in draft mode.`,
        metrics: {
          mode: publish ? 'published' : 'draft',
          graphVersion: version,
          pageName: page.name,
          videoId: session.video_id,
          videoStatus: status.video_status,
          fileMegabytes: round(video.size / 1024 ** 2, 2),
          uploadSeconds: round(uploadSeconds, 1),
          waitSeconds: round(waitSeconds, 1),
          signedWithAppSecretProof: client.appSecret !== undefined,
          permalink,
        },
        artifacts: [repoRelative(ctx.repoRoot, videoPath)],
        notes: publish
          ? [
              'Open the link in a private browser window. If it plays without logging in, the app can publish publicly.',
              'Delete the test Reel from the Page afterwards.',
            ]
          : [
              'Find the draft in Meta Business Suite under Content, then delete it.',
              'Rerun with --publish to test public visibility.',
            ],
      };
    },
  };
}

export const publishFacebookReel = createFacebookReelSpike();
