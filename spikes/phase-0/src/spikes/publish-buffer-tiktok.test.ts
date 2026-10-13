import { describe, expect, it } from 'vitest';
import {
  jsonResponse,
  scriptedFetch,
  sentHeaders,
  sentJson,
  testContext,
} from '../harness/testing.ts';
import { publishBufferTiktok } from './publish-buffer-tiktok.ts';

const env = {
  BUFFER_API_KEY: 'buffer-key-abcdef123456',
  SPIKE_PUBLIC_VIDEO_URL: 'https://media.example.com/short.mp4',
};

const organizations = () =>
  jsonResponse({
    data: {
      account: {
        organizations: [
          { id: 'org-1', name: 'My Studio' },
          { id: 'org-2', name: 'Other' },
        ],
      },
    },
  });

const channels =
  (...services: string[]) =>
  () =>
    jsonResponse({
      data: {
        channels: services.map((service, index) => ({
          id: `channel-${index}`,
          name: `${service}-handle`,
          displayName: `${service} account`,
          service,
        })),
      },
    });

describe('publishBufferTiktok', () => {
  it('creates a TikTok draft with the AI-generated flag and never schedules it', async () => {
    const { fetch, calls } = scriptedFetch([
      organizations,
      channels('facebook', 'tiktok'),
      () =>
        jsonResponse({
          data: {
            createPost: { __typename: 'PostActionSuccess', post: { id: 'post-9', text: 'x' } },
          },
        }),
    ]);

    const outcome = await publishBufferTiktok.run(await testContext({ env, fetch }));

    expect(outcome.status).toBe('passed');
    expect(outcome.metrics).toMatchObject({
      tiktokChannel: 'tiktok account',
      draftPostId: 'post-9',
    });

    for (const call of calls) {
      expect(call.url).toBe('https://api.buffer.com');
      expect(sentHeaders(call).get('authorization')).toBe(`Bearer ${env.BUFFER_API_KEY}`);
    }
    expect(sentJson(calls[1]!)).toMatchObject({
      variables: { input: { organizationId: 'org-1' } },
    });
    expect(sentJson(calls[2]!)).toMatchObject({
      variables: {
        input: {
          channelId: 'channel-1',
          saveToDraft: true,
          schedulingType: 'automatic',
          mode: 'addToQueue',
          assets: [{ video: { url: env.SPIKE_PUBLIC_VIDEO_URL } }],
          metadata: { tiktok: { isAiGenerated: true } },
        },
      },
    });
  });

  it('uses the organization named in BUFFER_ORGANIZATION_ID', async () => {
    const { fetch, calls } = scriptedFetch([organizations, channels()]);
    await publishBufferTiktok.run(
      await testContext({ env: { ...env, BUFFER_ORGANIZATION_ID: 'org-2' }, fetch }),
    );
    expect(sentJson(calls[1]!)).toMatchObject({
      variables: { input: { organizationId: 'org-2' } },
    });
  });

  it('fails without creating anything when no TikTok channel is connected', async () => {
    const { fetch, calls } = scriptedFetch([organizations, channels('facebook', 'instagram')]);

    const outcome = await publishBufferTiktok.run(await testContext({ env, fetch }));

    expect(outcome.status).toBe('failed');
    expect(outcome.summary).toContain('no TikTok channel is connected');
    expect(outcome.summary).toContain('facebook, instagram');
    expect(calls).toHaveLength(2);
  });

  it('reports the reason when Buffer refuses the draft', async () => {
    const { fetch } = scriptedFetch([
      organizations,
      channels('tiktok'),
      () =>
        jsonResponse({
          data: {
            createPost: { __typename: 'MutationError', message: 'Video could not be fetched' },
          },
        }),
    ]);

    const outcome = await publishBufferTiktok.run(await testContext({ env, fetch }));

    expect(outcome).toMatchObject({
      status: 'failed',
      summary: 'Buffer refused the draft: Video could not be fetched',
    });
  });

  it('raises GraphQL errors such as an invalid key', async () => {
    const { fetch } = scriptedFetch([
      () => jsonResponse({ errors: [{ message: 'Unauthorized' }] }),
    ]);
    await expect(publishBufferTiktok.run(await testContext({ env, fetch }))).rejects.toThrow(
      'Buffer organization lookup failed: Unauthorized',
    );
  });

  it('rejects a video URL that is not https', async () => {
    const { fetch, calls } = scriptedFetch([]);
    const insecure = { ...env, SPIKE_PUBLIC_VIDEO_URL: 'http://media.example.com/short.mp4' };

    await expect(
      publishBufferTiktok.run(await testContext({ env: insecure, fetch })),
    ).rejects.toThrow('must be an https URL');
    expect(calls).toHaveLength(0);
  });
});
