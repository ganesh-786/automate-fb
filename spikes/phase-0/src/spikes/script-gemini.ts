import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Brief } from '@automate/contracts';
import {
  BriefSchema,
  CONTRACTS_VERSION,
  ScriptDraftSchema,
  scriptDurationSeconds,
} from '@automate/contracts';
import { z } from 'zod';
import { optionalEnv } from '../harness/env.ts';
import { repoRelative } from '../harness/paths.ts';
import type { Spike, SpikeOutcome } from '../harness/types.ts';
import { requestJson } from '../lib/http.ts';
import { toProviderJsonSchema } from '../lib/json-schema.ts';

/**
 * Gemini Interactions API. Request and response shapes were taken from
 * https://ai.google.dev/api/interactions-api on 2026-10-13.
 */
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_MODEL = 'gemini-3.8-flash';
const REQUEST_TIMEOUT_MS = 120_000;

export const SCRIPT_FILE = 'script.json';
const RAW_OUTPUT_FILE = 'model-output.txt';

export const SAMPLE_BRIEF: Brief = BriefSchema.parse({
  schemaVersion: CONTRACTS_VERSION,
  briefId: '0b6f1f3e-3a3b-4c57-9d0e-2f1c5a7b9e10',
  createdAt: '2026-10-13T00:00:00Z',
  prompt: 'Explain why honey never spoils, with one surprising fact up front.',
  niche: 'everyday science',
  audience: 'curious adults who watch short videos on their phone',
  language: 'en',
  tone: 'curious, warm and concise',
  targetPlatforms: ['facebook', 'instagram', 'youtube', 'tiktok'],
  durationSeconds: 45,
  callToAction: 'Follow for more everyday science.',
  realisticPersonOrVoice: false,
});

const SYSTEM_INSTRUCTION = [
  'You write scripts for vertical short videos made of still images with narration and captions.',
  'Open with a hook that lands in the first two seconds. Develop one idea only.',
  'Write narration as it will be spoken: short sentences, plain words, no stage directions.',
  'Each scene needs an image prompt for one 9:16 still. Never ask for text inside the image.',
  'Scene durations must add up to the requested length, at about 2.5 spoken words per second.',
  'List every factual statement under claims so a human can check it before production.',
  'Write platformCopy for each requested platform. Hashtags start with # and contain no spaces.',
  'Do not impersonate real people and do not give medical, legal or financial advice.',
].join('\n');

function briefPrompt(brief: Brief): string {
  return [
    `Request: ${brief.prompt}`,
    `Niche: ${brief.niche}`,
    `Audience: ${brief.audience}`,
    `Language: ${brief.language}`,
    `Tone: ${brief.tone}`,
    `Length: ${brief.durationSeconds} seconds`,
    `Platforms: ${brief.targetPlatforms.join(', ')}`,
    `Call to action: ${brief.callToAction ?? 'none'}`,
  ].join('\n');
}

export function buildScriptRequest(brief: Brief, model: string): Record<string, unknown> {
  return {
    model,
    system_instruction: SYSTEM_INSTRUCTION,
    input: briefPrompt(brief),
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: toProviderJsonSchema(ScriptDraftSchema),
    },
    // Not stored: nothing is retained for later retrieval and no follow-up turn is needed.
    store: false,
  };
}

const InteractionSchema = z.object({
  status: z.string(),
  steps: z
    .array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      total_input_tokens: z.number().optional(),
      total_output_tokens: z.number().optional(),
      total_thought_tokens: z.number().optional(),
    })
    .optional(),
});
type Interaction = z.infer<typeof InteractionSchema>;

/** The text the model produced, joined across every `model_output` step. */
export function extractOutputText(interaction: Interaction): string {
  return (interaction.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');
}

const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const round = (value: number, digits: number): number => Number(value.toFixed(digits));

export const scriptGemini: Spike = {
  id: 'script-gemini',
  title: 'Schema-valid script from Gemini on the free tier',
  risk: 'The free tier may not return output that satisfies the script contract.',
  exitCriterion: 'One request returns JSON that parses as a ScriptDraft.',
  requiredEnv: ['GEMINI_API_KEY'],

  async run(ctx) {
    const apiKey = ctx.env.GEMINI_API_KEY ?? '';
    const model = optionalEnv(ctx.env, 'GEMINI_MODEL') ?? DEFAULT_MODEL;
    const brief = SAMPLE_BRIEF;

    ctx.log(`Requesting a ${brief.durationSeconds} s script from ${model}`);
    const started = performance.now();
    const interaction = InteractionSchema.parse(
      await requestJson(
        ctx.fetch,
        ENDPOINT,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(buildScriptRequest(brief, model)),
        },
        { label: 'Gemini script request', timeoutMs: REQUEST_TIMEOUT_MS },
      ),
    );
    const latencySeconds = (performance.now() - started) / 1000;

    const baseMetrics = {
      model,
      latencySeconds: round(latencySeconds, 2),
      inputTokens: interaction.usage?.total_input_tokens ?? 0,
      outputTokens: interaction.usage?.total_output_tokens ?? 0,
      thoughtTokens: interaction.usage?.total_thought_tokens ?? 0,
    };
    const fail = (summary: string, artifacts: string[] = []): SpikeOutcome => ({
      status: 'failed',
      summary,
      metrics: baseMetrics,
      artifacts,
      notes: [],
    });

    if (interaction.status !== 'completed') {
      return fail(`Interaction ended with status "${interaction.status}".`);
    }

    const text = extractOutputText(interaction);
    const rawPath = join(ctx.runDir, RAW_OUTPUT_FILE);
    await writeFile(rawPath, text, 'utf8');
    const rawArtifact = [repoRelative(ctx.repoRoot, rawPath)];

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail('The model output was not valid JSON.', rawArtifact);
    }

    const parsed = ScriptDraftSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
      return fail(`The output broke the script contract: ${issues.join('; ')}`, rawArtifact);
    }

    const draft = parsed.data;
    const scriptPath = join(ctx.runDir, SCRIPT_FILE);
    await writeFile(scriptPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');

    const totalSeconds = scriptDurationSeconds(draft);
    const narrationWords = draft.scenes.reduce(
      (sum, scene) => sum + countWords(scene.narration),
      0,
    );
    const missingPlatforms = brief.targetPlatforms.filter(
      (platform) => !draft.platformCopy.some((copy) => copy.platform === platform),
    );

    const notes: string[] = [];
    if (Math.abs(totalSeconds - brief.durationSeconds) > brief.durationSeconds * 0.2) {
      notes.push(
        `Scenes total ${round(totalSeconds, 1)} s against ${brief.durationSeconds} s requested.`,
      );
    }
    if (missingPlatforms.length > 0) {
      notes.push(`No copy was written for: ${missingPlatforms.join(', ')}.`);
    }

    return {
      status: 'passed',
      summary: `Valid script "${draft.title}" with ${draft.scenes.length} scenes in ${round(latencySeconds, 1)} s`,
      metrics: {
        ...baseMetrics,
        scenes: draft.scenes.length,
        claims: draft.claims.length,
        scriptSeconds: round(totalSeconds, 1),
        requestedSeconds: brief.durationSeconds,
        narrationWords,
        wordsPerSecond: round(narrationWords / totalSeconds, 2),
      },
      artifacts: [repoRelative(ctx.repoRoot, scriptPath), ...rawArtifact],
      notes,
    };
  },
};
