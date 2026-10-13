import { describe, expect, it } from 'vitest';
import { GROUPS, SPIKES, selectSpikes } from './registry.ts';
import { planScenes } from './spikes/render-remotion.ts';

const ids = (names: readonly string[]): string[] => selectSpikes(names).map((spike) => spike.id);

describe('selectSpikes', () => {
  it('selects every spike when no names are given', () => {
    expect(ids([])).toEqual(SPIKES.map((spike) => spike.id));
  });

  it('keeps registry order regardless of argument order', () => {
    expect(ids(['render-remotion', 'voice-kokoro'])).toEqual(['voice-kokoro', 'render-remotion']);
  });

  it('expands the local group to the spikes that need no credentials', () => {
    expect(ids(['local'])).toEqual(['voice-kokoro', 'render-remotion']);
    expect(GROUPS.local).toEqual(['voice-kokoro', 'render-remotion']);
  });

  it('does not duplicate a spike named twice or covered by a group', () => {
    expect(ids(['local', 'voice-kokoro', 'voice-kokoro'])).toEqual([
      'voice-kokoro',
      'render-remotion',
    ]);
  });

  it('names the valid choices when a spike is unknown', () => {
    expect(() => selectSpikes(['nope'])).toThrow(/Unknown spike "nope".*voice-kokoro/);
  });
});

describe('registry', () => {
  it('has unique ids and requires credentials for every networked spike', () => {
    expect(new Set(SPIKES.map((spike) => spike.id)).size).toBe(SPIKES.length);
    for (const spike of SPIKES.filter((candidate) => !GROUPS.local?.includes(candidate.id))) {
      expect(spike.requiredEnv.length).toBeGreaterThan(0);
    }
  });
});

describe('planScenes', () => {
  it('covers the whole video with back-to-back scenes', () => {
    const scenes = planScenes(900, 30);

    expect(scenes).toHaveLength(6);
    expect(scenes.map((scene) => scene.startFrame)).toEqual([0, 150, 300, 450, 600, 750]);
    expect(scenes.reduce((total, scene) => total + scene.durationInFrames, 0)).toBe(900);
    expect(new Set(scenes.map((scene) => scene.image)).size).toBe(6);
  });

  it('shortens the last scene when the length is not a multiple of the scene length', () => {
    const scenes = planScenes(400, 30);
    expect(scenes.map((scene) => scene.durationInFrames)).toEqual([150, 150, 100]);
  });
});
