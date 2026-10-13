import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { repoRelative } from '../harness/paths.ts';
import type { Spike } from '../harness/types.ts';
import { splitSentences } from '../lib/text.ts';
import { concatenateClips, encodeWavPcm16, measureSignal } from '../lib/wav.ts';

export const NARRATION_FILE = 'narration.wav';
export const TIMINGS_FILE = 'narration.json';

export const NarrationManifestSchema = z.object({
  sampleRate: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  sentences: z.array(
    z.object({
      text: z.string(),
      startSeconds: z.number().nonnegative(),
      endSeconds: z.number().positive(),
    }),
  ),
});
export type NarrationManifest = z.infer<typeof NarrationManifestSchema>;

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DTYPES = ['fp32', 'fp16', 'q8', 'q4', 'q4f16'] as const;
type Dtype = (typeof DTYPES)[number];
/**
 * Full precision is both the best-sounding variant and, on this CPU, about five times faster
 * than the 8-bit quantized one (0.24x against 1.17x real time, measured 2026-10-13).
 */
const DEFAULT_DTYPE: Dtype = 'fp32';
/** How Transformers.js names each variant's weights file: `onnx/model<suffix>.onnx`. */
const MODEL_FILE_SUFFIX: Record<Dtype, string> = {
  fp32: '',
  fp16: '_fp16',
  q8: '_quantized',
  q4: '_q4',
  q4f16: '_q4f16',
};
/**
 * The first load straight after the 326 MB download failed once with a file-access error and
 * succeeded on the next attempt, consistent with a virus scanner still holding the new file.
 */
const LOAD_RETRY_DELAY_MS = 5_000;

const SENTENCE_GAP_SECONDS = 0.18;
const MIN_AUDIO_SECONDS = 40;
const MAX_AUDIO_SECONDS = 100;
/** Below this the track is effectively silent and synthesis has failed quietly. */
const MIN_RMS = 0.01;
/**
 * Synthesis time divided by audio length. At 2, the longest narration the pipeline allows (90 s)
 * is ready in three minutes, which is acceptable for one or two videos a day.
 */
const MAX_REAL_TIME_FACTOR = 2;

/** About 160 words, roughly a minute of speech: the length of a typical short. */
const NARRATION = `
Honey is one of the few foods that almost never spoils.
Archaeologists have found pots of honey in ancient tombs that were still safe to eat after thousands of years.
The secret starts with water, or rather the lack of it.
Honey is so low in moisture that most bacteria simply cannot survive in it.
Bees also add an enzyme that slowly produces a tiny amount of hydrogen peroxide.
That makes honey gently hostile to anything trying to grow there.
On top of that, honey is naturally acidic, which is another barrier for microbes.
As long as the jar stays sealed and dry, it can sit on a shelf for decades.
If it turns cloudy or hard, do not throw it away.
That is only crystallised sugar, and a warm water bath will bring it back.
So the next time you find an old jar in the cupboard, give it a second chance.
`;

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

function parseDtype(value: string): Dtype {
  const match = DTYPES.find((dtype) => dtype === value);
  if (!match) throw new Error(`Unknown dtype "${value}". Use one of: ${DTYPES.join(', ')}.`);
  return match;
}

export const voiceKokoro: Spike = {
  id: 'voice-kokoro',
  title: 'Local narration with Kokoro on CPU',
  risk: 'Kokoro may not run, or may be too slow, on a laptop without a GPU.',
  exitCriterion: `About a minute of audible narration, synthesised at or under ${MAX_REAL_TIME_FACTOR}x real time.`,
  requiredEnv: [],

  async run(ctx) {
    const dtype = parseDtype(ctx.options.get('dtype') ?? DEFAULT_DTYPE);
    const requestedVoice = ctx.options.get('voice') ?? 'af_heart';

    // Loaded lazily: these pull in the ONNX runtime, which other spikes should not pay for.
    const { KokoroTTS } = await import('kokoro-js');
    const { env: transformersEnv } = await import('@huggingface/transformers');
    const modelCacheDir = join(ctx.cacheDir, 'huggingface');
    const modelWasCached = existsSync(
      join(modelCacheDir, MODEL_ID, 'onnx', `model${MODEL_FILE_SUFFIX[dtype]}.onnx`),
    );
    transformersEnv.cacheDir = modelCacheDir;

    ctx.log(`Loading ${MODEL_ID} (${dtype})${modelWasCached ? '' : ', downloading on first run'}`);
    const loadStarted = performance.now();
    const load = () => KokoroTTS.from_pretrained(MODEL_ID, { dtype, device: 'cpu' });
    let loadAttempts = 1;
    const tts = await load().catch(async (error: unknown) => {
      ctx.log(
        `Model load failed (${error instanceof Error ? error.message : String(error)}); retrying once`,
      );
      loadAttempts = 2;
      await new Promise((resolve) => setTimeout(resolve, LOAD_RETRY_DELAY_MS));
      return load();
    });
    const loadSeconds = (performance.now() - loadStarted) / 1000;

    const voices = tts.voices;
    const isVoice = (name: string): name is keyof typeof voices => name in voices;
    if (!isVoice(requestedVoice)) throw new Error(`Unknown voice "${requestedVoice}".`);

    const sentences = splitSentences(NARRATION);
    const clips: Float32Array[] = [];
    let sampleRate = 0;
    const synthesisStarted = performance.now();
    for (const [index, sentence] of sentences.entries()) {
      const audio = await tts.generate(sentence, { voice: requestedVoice });
      if (sampleRate !== 0 && audio.sampling_rate !== sampleRate) {
        throw new Error('Kokoro returned clips with different sample rates.');
      }
      sampleRate = audio.sampling_rate;
      clips.push(audio.audio);
      ctx.log(`Synthesised sentence ${index + 1} of ${sentences.length}`);
    }
    const synthesisSeconds = (performance.now() - synthesisStarted) / 1000;

    const { samples, spans } = concatenateClips(clips, sampleRate, SENTENCE_GAP_SECONDS);
    const audioSeconds = samples.length / sampleRate;
    const { peak, rms } = measureSignal(samples);
    const realTimeFactor = synthesisSeconds / audioSeconds;

    const manifest: NarrationManifest = {
      sampleRate,
      durationSeconds: audioSeconds,
      sentences: sentences.map((text, index) => {
        const span = spans[index];
        if (!span) throw new Error(`Missing audio span for sentence ${index + 1}.`);
        return { text, ...span };
      }),
    };
    const wavPath = join(ctx.runDir, NARRATION_FILE);
    const timingsPath = join(ctx.runDir, TIMINGS_FILE);
    await writeFile(wavPath, encodeWavPcm16(samples, sampleRate));
    await writeFile(timingsPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const problems: string[] = [];
    if (audioSeconds < MIN_AUDIO_SECONDS || audioSeconds > MAX_AUDIO_SECONDS) {
      problems.push(
        `audio is ${round(audioSeconds, 1)} s, outside ${MIN_AUDIO_SECONDS}-${MAX_AUDIO_SECONDS} s`,
      );
    }
    if (rms < MIN_RMS) problems.push(`audio is nearly silent (RMS ${round(rms, 4)})`);
    if (realTimeFactor > MAX_REAL_TIME_FACTOR) {
      problems.push(
        `synthesis ran at ${round(realTimeFactor, 2)}x real time, over the ${MAX_REAL_TIME_FACTOR}x limit`,
      );
    }

    const speed = `${round(audioSeconds, 1)} s of speech in ${round(synthesisSeconds, 1)} s (${round(realTimeFactor, 2)}x real time)`;
    return {
      status: problems.length === 0 ? 'passed' : 'failed',
      summary: problems.length === 0 ? speed : `${speed}; ${problems.join('; ')}`,
      metrics: {
        model: MODEL_ID,
        dtype,
        voice: requestedVoice,
        modelWasCached,
        modelLoadAttempts: loadAttempts,
        modelLoadSeconds: round(loadSeconds, 2),
        synthesisSeconds: round(synthesisSeconds, 2),
        audioSeconds: round(audioSeconds, 2),
        realTimeFactor: round(realTimeFactor, 3),
        sampleRate,
        sentences: sentences.length,
        peak: round(peak, 3),
        rms: round(rms, 4),
      },
      artifacts: [wavPath, timingsPath].map((path) => repoRelative(ctx.repoRoot, path)),
      notes: modelWasCached
        ? []
        : ['Model load time includes the first-run download of the model weights.'],
    };
  },
};
