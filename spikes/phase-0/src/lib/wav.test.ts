import { describe, expect, it } from 'vitest';
import { concatenateClips, encodeWavPcm16, measureSignal } from './wav.ts';

describe('encodeWavPcm16', () => {
  it('writes a canonical 44-byte PCM header', () => {
    const wav = encodeWavPcm16(new Float32Array(100), 24_000);

    expect(wav.length).toBe(44 + 200);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(36 + 200);
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(28)).toBe(48_000); // byte rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(200);
  });

  it('scales samples to 16-bit and clamps out-of-range values', () => {
    const wav = encodeWavPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]), 8000);
    const read = (index: number): number => wav.readInt16LE(44 + index * 2);

    expect([read(0), read(1), read(2), read(3), read(4)]).toEqual([
      0, 32767, -32767, 32767, -32767,
    ]);
    expect(read(5)).toBe(16384);
  });
});

describe('measureSignal', () => {
  it('reports peak and RMS', () => {
    const stats = measureSignal(new Float32Array([0.5, -0.5, 0.5, -0.5]));
    expect(stats.peak).toBe(0.5);
    expect(stats.rms).toBeCloseTo(0.5);
  });

  it('reports silence for an empty signal', () => {
    expect(measureSignal(new Float32Array(0))).toEqual({ peak: 0, rms: 0 });
  });
});

describe('concatenateClips', () => {
  it('inserts gaps between clips but not after the last one', () => {
    const one = new Float32Array(1000).fill(0.1);
    const two = new Float32Array(500).fill(0.2);
    const { samples, spans } = concatenateClips([one, two], 1000, 0.25);

    expect(samples.length).toBe(1000 + 250 + 500);
    expect(spans).toEqual([
      { startSeconds: 0, endSeconds: 1 },
      { startSeconds: 1.25, endSeconds: 1.75 },
    ]);
    expect(samples[1100]).toBe(0); // inside the gap
    expect(samples[1250]).toBeCloseTo(0.2);
  });

  it('returns an empty track for no clips', () => {
    expect(concatenateClips([], 1000, 0.25)).toEqual({ samples: new Float32Array(0), spans: [] });
  });
});
