import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScriptDraft } from '@automate/contracts';
import { describe, expect, it } from 'vitest';
import {
  jsonResponse,
  scriptedFetch,
  sentHeaders,
  sentJson,
  testContext,
} from '../harness/testing.ts';
import { HttpError } from '../lib/http.ts';
import {
  SAMPLE_BRIEF,
  SCRIPT_FILE,
  buildScriptRequest,
  extractOutputText,
  scriptGemini,
} from './script-gemini.ts';

const scene = {
  narration: 'Honey is one of the few foods that almost never spoils.',
  visualPrompt: 'A glowing jar of golden honey on a wooden table, warm light, macro shot',
  onScreenText: '',
  cameraMove: 'zoom-in',
  durationSeconds: 15,
} as const;

const draft: ScriptDraft = {
  title: 'Why honey never spoils',
  hook: 'This jar could outlive you.',
  scenes: [scene, scene, scene],
  callToAction: 'Follow for more everyday science.',
  claims: [
    { text: 'Honey can stay edible for thousands of years.', risk: 'low', needsSource: true },
  ],
  platformCopy: SAMPLE_BRIEF.targetPlatforms.map((platform) => ({
    platform,
    caption: 'Honey is forever.',
    hashtags: ['#science'],
    title: 'Why honey never spoils',
  })),
};

const completed = (text: string) => ({
  status: 'completed',
  steps: [
    { type: 'thought', content: [{ type: 'text', text: 'ignored' }] },
    { type: 'model_output', content: [{ type: 'text', text }] },
  ],
  usage: { total_input_tokens: 400, total_output_tokens: 900, total_thought_tokens: 50 },
});

const env = { GEMINI_API_KEY: 'fake-gemini-key' };

describe('buildScriptRequest', () => {
  it('asks for JSON that follows the script contract and is not stored', () => {
    const request = buildScriptRequest(SAMPLE_BRIEF, 'gemini-test');

    expect(request).toMatchObject({
      model: 'gemini-test',
      store: false,
      response_format: { type: 'text', mime_type: 'application/json' },
    });
    expect(String(request.input)).toContain('Length: 45 seconds');
    expect(JSON.stringify(request.response_format)).toContain('"scenes"');
  });
});

describe('extractOutputText', () => {
  it('joins text from model_output steps only', () => {
    expect(extractOutputText(completed('{"a":1}'))).toBe('{"a":1}');
    expect(extractOutputText({ status: 'completed' })).toBe('');
  });
});

describe('scriptGemini', () => {
  it('sends the key in a header and saves a valid script', async () => {
    const { fetch, calls } = scriptedFetch([() => jsonResponse(completed(JSON.stringify(draft)))]);
    const ctx = await testContext({ env, fetch });

    const outcome = await scriptGemini.run(ctx);

    expect(outcome.status).toBe('passed');
    expect(outcome.metrics).toMatchObject({ scenes: 3, scriptSeconds: 45, outputTokens: 900 });
    expect(outcome.notes).toEqual([]);

    const call = calls[0];
    expect(call?.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(call?.url).not.toContain(env.GEMINI_API_KEY);
    expect(sentHeaders(call!).get('x-goog-api-key')).toBe(env.GEMINI_API_KEY);
    expect(sentJson(call!)).toMatchObject({ model: 'gemini-3.8-flash', store: false });

    const saved = JSON.parse(await readFile(join(ctx.runDir, SCRIPT_FILE), 'utf8')) as unknown;
    expect(saved).toEqual(draft);
  });

  it('uses the model named in GEMINI_MODEL', async () => {
    const { fetch, calls } = scriptedFetch([() => jsonResponse(completed(JSON.stringify(draft)))]);
    await scriptGemini.run(
      await testContext({ env: { ...env, GEMINI_MODEL: 'gemini-other' }, fetch }),
    );
    expect(sentJson(calls[0]!)).toMatchObject({ model: 'gemini-other' });
  });

  it('fails when the output breaks the contract', async () => {
    const tooShort = { ...draft, scenes: [scene] };
    const { fetch } = scriptedFetch([() => jsonResponse(completed(JSON.stringify(tooShort)))]);

    const outcome = await scriptGemini.run(await testContext({ env, fetch }));

    expect(outcome.status).toBe('failed');
    expect(outcome.summary).toContain('broke the script contract');
    expect(outcome.summary).toContain('scenes');
  });

  it('fails when the output is not JSON', async () => {
    const { fetch } = scriptedFetch([() => jsonResponse(completed('Sure! Here is your script.'))]);
    const outcome = await scriptGemini.run(await testContext({ env, fetch }));
    expect(outcome).toMatchObject({
      status: 'failed',
      summary: 'The model output was not valid JSON.',
    });
  });

  it('fails when the interaction did not complete', async () => {
    const { fetch } = scriptedFetch([() => jsonResponse({ status: 'failed' })]);
    const outcome = await scriptGemini.run(await testContext({ env, fetch }));
    expect(outcome).toMatchObject({
      status: 'failed',
      summary: 'Interaction ended with status "failed".',
    });
  });

  it('notes a script that misses the requested length', async () => {
    const short = { ...draft, scenes: [scene, scene, { ...scene, durationSeconds: 2 }] };
    const { fetch } = scriptedFetch([() => jsonResponse(completed(JSON.stringify(short)))]);

    const outcome = await scriptGemini.run(await testContext({ env, fetch }));

    expect(outcome.status).toBe('passed');
    expect(outcome.notes).toEqual(['Scenes total 32 s against 45 s requested.']);
  });

  it('surfaces a quota or auth error from the API', async () => {
    const { fetch } = scriptedFetch([
      () => jsonResponse({ error: { message: 'quota exceeded' } }, 429),
    ]);
    await expect(scriptGemini.run(await testContext({ env, fetch }))).rejects.toThrow(HttpError);
  });
});
