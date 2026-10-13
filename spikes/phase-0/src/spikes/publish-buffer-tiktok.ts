import { z } from 'zod';
import { optionalEnv } from '../harness/env.ts';
import type { Spike } from '../harness/types.ts';
import { requestJson } from '../lib/http.ts';

/**
 * Buffer GraphQL API. Queries and input types were taken from
 * https://developers.buffer.com/reference.html and its examples on 2026-10-13.
 */
const ENDPOINT = 'https://api.buffer.com';
const CAPTION = 'Pipeline connectivity test. Draft only, safe to delete.';

const ORGANIZATIONS_QUERY = `
  query GetOrganizations {
    account {
      organizations {
        id
        name
      }
    }
  }`;

const CHANNELS_QUERY = `
  query GetChannels($input: ChannelsInput!) {
    channels(input: $input) {
      id
      name
      displayName
      service
    }
  }`;

const CREATE_POST_MUTATION = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess {
        post {
          id
          text
        }
      }
      ... on MutationError {
        message
      }
    }
  }`;

const GraphqlResponseSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});
const OrganizationsSchema = z.object({
  account: z.object({ organizations: z.array(z.object({ id: z.string(), name: z.string() })) }),
});
const ChannelsSchema = z.object({
  channels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      displayName: z.string().nullish(),
      service: z.string(),
    }),
  ),
});
const CreatePostSchema = z.object({
  createPost: z.object({
    post: z.object({ id: z.string() }).optional(),
    message: z.string().optional(),
  }),
});

async function graphql(
  fetchFn: typeof globalThis.fetch,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  label: string,
): Promise<unknown> {
  const response = GraphqlResponseSchema.parse(
    await requestJson(
      fetchFn,
      ENDPOINT,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, variables }),
      },
      { label },
    ),
  );
  if (response.errors?.length) {
    throw new Error(`${label} failed: ${response.errors.map((error) => error.message).join('; ')}`);
  }
  return response.data;
}

export const publishBufferTiktok: Spike = {
  id: 'publish-buffer-tiktok',
  title: 'Create a TikTok video draft through the Buffer API',
  risk: "Buffer's free plan may not let the API create TikTok video posts.",
  exitCriterion:
    'The API key works, a TikTok channel is found, and a draft video post is created for it. Nothing is published.',
  requiredEnv: ['BUFFER_API_KEY', 'SPIKE_PUBLIC_VIDEO_URL'],

  async run(ctx) {
    const apiKey = ctx.env.BUFFER_API_KEY ?? '';
    const videoUrl = new URL(ctx.env.SPIKE_PUBLIC_VIDEO_URL ?? '');
    if (videoUrl.protocol !== 'https:')
      throw new Error('SPIKE_PUBLIC_VIDEO_URL must be an https URL.');

    const { account } = OrganizationsSchema.parse(
      await graphql(ctx.fetch, apiKey, ORGANIZATIONS_QUERY, {}, 'Buffer organization lookup'),
    );
    const preferredId = optionalEnv(ctx.env, 'BUFFER_ORGANIZATION_ID');
    const organization = preferredId
      ? account.organizations.find((candidate) => candidate.id === preferredId)
      : account.organizations[0];
    if (!organization)
      throw new Error('No matching Buffer organization was found for this API key.');
    ctx.log(`Organization: ${organization.name}`);

    const { channels } = ChannelsSchema.parse(
      await graphql(
        ctx.fetch,
        apiKey,
        CHANNELS_QUERY,
        { input: { organizationId: organization.id } },
        'Buffer channel lookup',
      ),
    );
    const services = channels.map((channel) => channel.service);
    const baseMetrics = {
      organization: organization.name,
      channels: channels.length,
      services: services.join(', ') || 'none',
    };

    const tiktok = channels.find((channel) => /tiktok/i.test(channel.service));
    if (!tiktok) {
      return {
        status: 'failed',
        summary: `The API key works, but no TikTok channel is connected in Buffer (connected: ${baseMetrics.services}).`,
        metrics: baseMetrics,
        artifacts: [],
        notes: ['Connect a TikTok channel at buffer.com, then rerun this spike.'],
      };
    }
    const channelName = tiktok.displayName ?? tiktok.name;
    ctx.log(`TikTok channel: ${channelName}`);

    const { createPost } = CreatePostSchema.parse(
      await graphql(
        ctx.fetch,
        apiKey,
        CREATE_POST_MUTATION,
        {
          input: {
            channelId: tiktok.id,
            text: CAPTION,
            schedulingType: 'automatic',
            mode: 'addToQueue',
            saveToDraft: true,
            assets: [{ video: { url: videoUrl.href } }],
            metadata: { tiktok: { isAiGenerated: true } },
          },
        },
        'Buffer draft creation',
      ),
    );

    if (!createPost.post) {
      return {
        status: 'failed',
        summary: `Buffer refused the draft: ${createPost.message ?? 'no reason given'}`,
        metrics: { ...baseMetrics, tiktokChannel: channelName },
        artifacts: [],
        notes: [],
      };
    }

    return {
      status: 'passed',
      summary: `Draft ${createPost.post.id} created for TikTok channel "${channelName}".`,
      metrics: { ...baseMetrics, tiktokChannel: channelName, draftPostId: createPost.post.id },
      artifacts: [],
      notes: [
        'Open Buffer, check the draft shows the video and the AI-generated label, then delete it.',
        'A draft proves API access. Public auto-publishing is confirmed by the first real post in Phase 5.',
      ],
    };
  },
};
