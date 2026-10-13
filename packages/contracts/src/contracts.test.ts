import { describe, expect, it } from 'vitest';
import type { Brief, ScriptDraft } from './index.ts';
import {
  BriefSchema,
  CONTRACTS_VERSION,
  ScriptDraftSchema,
  ScriptSchema,
  Sha256Schema,
  scriptDurationSeconds,
} from './index.ts';

const brief: Brief = {
  schemaVersion: CONTRACTS_VERSION,
  briefId: '0b6f1f3e-3a3b-4c57-9d0e-2f1c5a7b9e10',
  createdAt: '2026-10-13T09:30:00Z',
  prompt: 'Explain why honey never spoils in a punchy, curious tone.',
  niche: 'everyday science',
  audience: 'curious adults who scroll short videos',
  language: 'en',
  tone: 'curious and upbeat',
  targetPlatforms: ['facebook', 'instagram'],
  durationSeconds: 45,
  realisticPersonOrVoice: false,
};

const scene = {
  narration: 'Honey is one of the few foods that almost never spoils.',
  visualPrompt: 'A glowing jar of golden honey on a wooden table, warm morning light, macro shot',
  onScreenText: '',
  cameraMove: 'zoom-in',
  durationSeconds: 5,
} as const;

const draft: ScriptDraft = {
  title: 'Why honey never spoils',
  hook: 'This jar could outlive you.',
  scenes: [scene, scene, scene],
  callToAction: 'Follow for more everyday science.',
  claims: [
    { text: 'Honey found in ancient tombs was still edible.', risk: 'low', needsSource: true },
  ],
  platformCopy: [
    { platform: 'facebook', caption: 'Honey is forever.', hashtags: ['#science'], title: '' },
  ],
};

describe('BriefSchema', () => {
  it('accepts a complete brief', () => {
    expect(BriefSchema.parse(brief)).toEqual(brief);
  });

  it('rejects a platform listed twice', () => {
    const result = BriefSchema.safeParse({ ...brief, targetPlatforms: ['facebook', 'facebook'] });
    expect(result.success).toBe(false);
  });

  it('rejects durations outside what every platform accepts', () => {
    expect(BriefSchema.safeParse({ ...brief, durationSeconds: 91 }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...brief, durationSeconds: 14 }).success).toBe(false);
  });

  it('rejects a document written by another contract version', () => {
    expect(BriefSchema.safeParse({ ...brief, schemaVersion: '9.0.0' }).success).toBe(false);
  });
});

describe('ScriptDraftSchema', () => {
  it('accepts a complete draft', () => {
    expect(ScriptDraftSchema.parse(draft)).toEqual(draft);
  });

  it('requires at least three scenes', () => {
    expect(ScriptDraftSchema.safeParse({ ...draft, scenes: [scene, scene] }).success).toBe(false);
  });

  it('rejects hashtags without a leading #', () => {
    const platformCopy = [{ ...draft.platformCopy[0], hashtags: ['science'] }];
    expect(ScriptDraftSchema.safeParse({ ...draft, platformCopy }).success).toBe(false);
  });

  it('rejects an unknown camera move', () => {
    const scenes = [{ ...scene, cameraMove: 'spin' }, scene, scene];
    expect(ScriptDraftSchema.safeParse({ ...draft, scenes }).success).toBe(false);
  });
});

describe('ScriptSchema', () => {
  it('adds the storage envelope to a draft', () => {
    const script = {
      ...draft,
      schemaVersion: CONTRACTS_VERSION,
      scriptId: '5f0c2c5e-9d51-4b0a-8a53-1d2e3f4a5b6c',
      briefId: brief.briefId,
      createdAt: '2026-10-13T09:31:00Z',
    };
    expect(ScriptSchema.parse(script)).toEqual(script);
  });
});

describe('scriptDurationSeconds', () => {
  it('sums scene durations', () => {
    expect(scriptDurationSeconds(draft)).toBe(15);
  });
});

describe('Sha256Schema', () => {
  it('accepts lowercase hex digests only', () => {
    expect(Sha256Schema.safeParse('a'.repeat(64)).success).toBe(true);
    expect(Sha256Schema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(Sha256Schema.safeParse('a'.repeat(63)).success).toBe(false);
  });
});
