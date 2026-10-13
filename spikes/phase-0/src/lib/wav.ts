const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

/** Encodes mono floating-point samples in the range -1..1 as a 16-bit PCM WAV file. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = Buffer.alloc(HEADER_BYTES + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(HEADER_BYTES - 8 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // size of the fmt chunk
  buffer.writeUInt16LE(1, 20); // format: PCM
  buffer.writeUInt16LE(1, 22); // channels: mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * BYTES_PER_SAMPLE, 28); // byte rate
  buffer.writeUInt16LE(BYTES_PER_SAMPLE, 32); // block align
  buffer.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clamped * 32767), HEADER_BYTES + index * BYTES_PER_SAMPLE);
  });
  return buffer;
}

export interface SignalStats {
  peak: number;
  rms: number;
}

export function measureSignal(samples: Float32Array): SignalStats {
  let peak = 0;
  let sumOfSquares = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
    sumOfSquares += sample * sample;
  }
  return { peak, rms: samples.length === 0 ? 0 : Math.sqrt(sumOfSquares / samples.length) };
}

export interface ClipSpan {
  startSeconds: number;
  endSeconds: number;
}

/** Joins clips into one track with silence between them and reports where each clip landed. */
export function concatenateClips(
  clips: readonly Float32Array[],
  sampleRate: number,
  gapSeconds: number,
): { samples: Float32Array; spans: ClipSpan[] } {
  const gapSamples = Math.round(gapSeconds * sampleRate);
  const totalSamples =
    clips.reduce((total, clip) => total + clip.length, 0) +
    gapSamples * Math.max(0, clips.length - 1);

  const samples = new Float32Array(totalSamples);
  const spans: ClipSpan[] = [];
  let cursor = 0;
  for (const clip of clips) {
    samples.set(clip, cursor);
    spans.push({
      startSeconds: cursor / sampleRate,
      endSeconds: (cursor + clip.length) / sampleRate,
    });
    cursor += clip.length + gapSamples;
  }
  return { samples, spans };
}
