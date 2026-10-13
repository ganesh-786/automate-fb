import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CameraMoveSchema } from '@automate/contracts';
import { repoRelative } from '../harness/paths.ts';
import type { Spike, SpikeContext } from '../harness/types.ts';
import { parseFrameRate, probeMedia } from '../lib/ffprobe.ts';
import { hasFastStart, listTopLevelBoxes } from '../lib/mp4.ts';
import type { ScenePalette } from '../lib/png.ts';
import { encodePngRgb, paintScenePlate } from '../lib/png.ts';
import type { TimedSpan } from '../lib/text.ts';
import { approximateWordTimings } from '../lib/text.ts';
import { encodeWavPcm16 } from '../lib/wav.ts';
import type { CaptionWord, SceneProps, ShortVideoProps } from '../remotion/props.ts';
import { COMPOSITION_ID } from '../remotion/props.ts';
import { NARRATION_FILE, NarrationManifestSchema, TIMINGS_FILE } from './voice-kokoro.ts';

export const VIDEO_FILE = 'short.mp4';

/** The one render profile all four target platforms accept (docs/PLAN.md, "Stack"). */
export const MASTER_PROFILE = {
  width: 1080,
  height: 1920,
  fps: 30,
  videoCodec: 'h264',
  pixelFormat: 'yuv420p',
  // Without an explicit colour space Remotion tags the stream full-range (yuvj420p), which
  // players and platform transcoders can render with the wrong contrast.
  colorSpace: 'bt709',
  // Quality stays CRF-driven, but capped so a 90 s video cannot exceed about 90 MB.
  maxVideoBitrate: '8M',
  videoBufferSize: '16M',
  audioCodec: 'aac',
} as const;

/** The video cap plus audio and container overhead. */
const MAX_TOTAL_BITRATE_KBPS = 9_000;

const DEFAULT_SECONDS = 30;
const SCENE_SECONDS = 5;
const CROSSFADE_FRAMES = 12;
const DURATION_TOLERANCE_SECONDS = 0.5;
/** Instagram's Reels limit, the smallest of the four platforms. */
const MAX_FILE_BYTES = 300 * 1024 * 1024;
/**
 * Render time divided by video length. At 10, the longest video the pipeline allows (90 s)
 * renders in 15 minutes, which is acceptable for one or two videos a day.
 */
const MAX_RENDER_SECONDS_PER_VIDEO_SECOND = 10;

const PALETTES: readonly ScenePalette[] = [
  { top: [18, 32, 74], bottom: [214, 122, 48], glow: [255, 226, 170] },
  { top: [12, 58, 52], bottom: [18, 22, 38], glow: [140, 240, 200] },
  { top: [70, 18, 60], bottom: [232, 98, 76], glow: [255, 200, 220] },
  { top: [10, 14, 28], bottom: [44, 76, 138], glow: [190, 215, 255] },
  { top: [92, 60, 16], bottom: [30, 18, 10], glow: [255, 214, 120] },
  { top: [24, 70, 104], bottom: [226, 232, 210], glow: [255, 255, 240] },
];

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

/** Lays scenes of equal length end to end, cycling through every camera move. */
export function planScenes(totalFrames: number, fps: number): SceneProps[] {
  const moves = CameraMoveSchema.options.filter((move) => move !== 'static');
  const framesPerScene = SCENE_SECONDS * fps;
  const scenes: SceneProps[] = [];
  for (let startFrame = 0; startFrame < totalFrames; startFrame += framesPerScene) {
    const index = scenes.length;
    scenes.push({
      image: `scene-${String(index + 1).padStart(2, '0')}.png`,
      startFrame,
      durationInFrames: Math.min(framesPerScene, totalFrames - startFrame),
      cameraMove: moves[index % moves.length] ?? 'zoom-in',
    });
  }
  return scenes;
}

interface Narration {
  source: 'kokoro' | 'tone';
  words: CaptionWord[];
}

/** A quiet tone and evenly spaced placeholder words, for when the voice spike has not run. */
function toneNarration(seconds: number): { wav: Buffer; sentences: TimedSpan[] } {
  const sampleRate = 24_000;
  const samples = new Float32Array(seconds * sampleRate);
  samples.forEach((_, index) => {
    samples[index] = 0.05 * Math.sin((2 * Math.PI * 220 * index) / sampleRate);
  });
  const sentences: TimedSpan[] = [];
  for (let start = 0; start + 2.5 <= seconds; start += 3) {
    sentences.push({
      text: 'Placeholder caption text here.',
      startSeconds: start,
      endSeconds: start + 2.5,
    });
  }
  return { wav: encodeWavPcm16(samples, sampleRate), sentences };
}

/** Puts the narration track in the bundle's public directory and returns its caption words. */
async function prepareNarration(
  ctx: SpikeContext,
  publicDir: string,
  seconds: number,
): Promise<Narration> {
  const wavPath = ctx.findArtifact('voice-kokoro', NARRATION_FILE);
  const timingsPath = ctx.findArtifact('voice-kokoro', TIMINGS_FILE);
  const target = join(publicDir, NARRATION_FILE);

  let source: Narration['source'];
  let sentences: readonly TimedSpan[];
  if (wavPath && timingsPath) {
    await copyFile(wavPath, target);
    const manifest = NarrationManifestSchema.parse(JSON.parse(await readFile(timingsPath, 'utf8')));
    source = 'kokoro';
    sentences = manifest.sentences;
  } else {
    const tone = toneNarration(seconds);
    await writeFile(target, tone.wav);
    source = 'tone';
    sentences = tone.sentences;
  }

  const limitMs = seconds * 1000;
  return {
    source,
    words: approximateWordTimings(sentences).filter((word) => word.endMs <= limitMs),
  };
}

async function writeScenePlates(publicDir: string, scenes: readonly SceneProps[]): Promise<void> {
  const { width, height } = MASTER_PROFILE;
  for (const [index, scene] of scenes.entries()) {
    const palette = PALETTES[index % PALETTES.length];
    if (!palette) throw new Error('No scene palettes are defined.');
    const pixels = paintScenePlate(width, height, palette, index + 1);
    await writeFile(join(publicDir, scene.image), encodePngRgb(width, height, pixels));
  }
}

export const renderRemotion: Spike = {
  id: 'render-remotion',
  title: 'Render a vertical short with Remotion on this laptop',
  risk: 'Rendering 1080x1920 video on a laptop CPU may be too slow, or the output may not meet platform specs.',
  exitCriterion: `A ${DEFAULT_SECONDS} s clip in the master profile (1080x1920, 30 fps, H.264 yuv420p BT.709 + AAC, fast-start, at most 9 Mbps), rendered at or under ${MAX_RENDER_SECONDS_PER_VIDEO_SECOND} s per video second.`,
  requiredEnv: [],

  async run(ctx) {
    const seconds = Number(ctx.options.get('seconds') ?? DEFAULT_SECONDS);
    if (!Number.isInteger(seconds) || seconds < SCENE_SECONDS || seconds > 90) {
      throw new Error(`--set seconds must be a whole number from ${SCENE_SECONDS} to 90.`);
    }
    const concurrencyOption = ctx.options.get('concurrency');
    const concurrency = concurrencyOption === undefined ? undefined : Number(concurrencyOption);

    const { fps, width, height } = MASTER_PROFILE;
    const durationInFrames = seconds * fps;
    const publicDir = join(ctx.runDir, 'public');
    await mkdir(publicDir, { recursive: true });

    const scenes = planScenes(durationInFrames, fps);
    ctx.log(`Painting ${scenes.length} scene plates`);
    await writeScenePlates(publicDir, scenes);
    const narration = await prepareNarration(ctx, publicDir, seconds);

    const inputProps: ShortVideoProps = {
      width,
      height,
      fps,
      durationInFrames,
      crossfadeFrames: CROSSFADE_FRAMES,
      scenes,
      words: narration.words,
      audio: NARRATION_FILE,
    };

    // Loaded lazily: the bundler and renderer are large and other spikes do not need them.
    const { bundle } = await import('@remotion/bundler');
    const { ensureBrowser, renderMedia, selectComposition } = await import('@remotion/renderer');

    ctx.log('Ensuring the headless browser is installed');
    const browserStarted = performance.now();
    await ensureBrowser();
    const browserSeconds = (performance.now() - browserStarted) / 1000;

    ctx.log('Bundling the composition');
    const bundleStarted = performance.now();
    const serveUrl = await bundle({
      entryPoint: fileURLToPath(new URL('../remotion/index.ts', import.meta.url)),
      publicDir,
    });
    const bundleSeconds = (performance.now() - bundleStarted) / 1000;

    const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
    const outputLocation = join(ctx.runDir, VIDEO_FILE);

    ctx.log(`Rendering ${seconds} s (${durationInFrames} frames)`);
    let lastReportedTenth = 0;
    const renderStarted = performance.now();
    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      outputLocation,
      codec: MASTER_PROFILE.videoCodec,
      pixelFormat: MASTER_PROFILE.pixelFormat,
      colorSpace: MASTER_PROFILE.colorSpace,
      encodingMaxRate: MASTER_PROFILE.maxVideoBitrate,
      encodingBufferSize: MASTER_PROFILE.videoBufferSize,
      audioCodec: MASTER_PROFILE.audioCodec,
      logLevel: 'error',
      ...(concurrency === undefined ? {} : { concurrency }),
      onProgress: ({ progress }) => {
        const tenth = Math.floor(progress * 10);
        if (tenth > lastReportedTenth) {
          lastReportedTenth = tenth;
          ctx.log(`Render ${tenth * 10}%`);
        }
      },
    });
    const renderSeconds = (performance.now() - renderStarted) / 1000;

    const probe = await probeMedia(outputLocation);
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
    const videoSeconds = Number(probe.format.duration);
    const fileBytes = (await stat(outputLocation)).size;
    const fastStart = hasFastStart(await listTopLevelBoxes(outputLocation));
    const measuredFps = video?.r_frame_rate ? parseFrameRate(video.r_frame_rate) : 0;
    const renderRatio = renderSeconds / seconds;
    const bitrateKbps = Math.round(Number(probe.format.bit_rate ?? 0) / 1000);

    const problems: string[] = [];
    const expect = (label: string, actual: unknown, expected: unknown): void => {
      if (actual !== expected)
        problems.push(`${label} is ${String(actual)}, expected ${String(expected)}`);
    };
    expect('width', video?.width, width);
    expect('height', video?.height, height);
    expect('frame rate', measuredFps, fps);
    expect('video codec', video?.codec_name, MASTER_PROFILE.videoCodec);
    expect('pixel format', video?.pix_fmt, MASTER_PROFILE.pixelFormat);
    expect('colour space', video?.color_space, MASTER_PROFILE.colorSpace);
    expect('audio codec', audio?.codec_name, MASTER_PROFILE.audioCodec);
    expect('fast-start layout', fastStart, true);
    if (bitrateKbps > MAX_TOTAL_BITRATE_KBPS) {
      problems.push(`bitrate is ${bitrateKbps} kbps, over the ${MAX_TOTAL_BITRATE_KBPS} kbps cap`);
    }
    if (Math.abs(videoSeconds - seconds) > DURATION_TOLERANCE_SECONDS) {
      problems.push(`duration is ${round(videoSeconds, 2)} s, expected ${seconds} s`);
    }
    if (fileBytes > MAX_FILE_BYTES) problems.push('file is larger than 300 MB');
    if (renderRatio > MAX_RENDER_SECONDS_PER_VIDEO_SECOND) {
      problems.push(
        `render took ${round(renderRatio, 1)} s per video second, over the ${MAX_RENDER_SECONDS_PER_VIDEO_SECOND} s limit`,
      );
    }

    const speed = `${seconds} s video rendered in ${round(renderSeconds, 1)} s (${round(renderRatio, 2)} s per video second)`;
    return {
      status: problems.length === 0 ? 'passed' : 'failed',
      summary: problems.length === 0 ? speed : `${speed}; ${problems.join('; ')}`,
      metrics: {
        videoSeconds: round(videoSeconds, 2),
        renderSeconds: round(renderSeconds, 1),
        renderSecondsPerVideoSecond: round(renderRatio, 2),
        renderedFramesPerSecond: round(durationInFrames / renderSeconds, 1),
        bundleSeconds: round(bundleSeconds, 1),
        browserSetupSeconds: round(browserSeconds, 1),
        concurrency: concurrency ?? 'default',
        width: video?.width ?? 0,
        height: video?.height ?? 0,
        fps: round(measuredFps, 3),
        videoCodec: video?.codec_name ?? 'missing',
        pixelFormat: video?.pix_fmt ?? 'missing',
        colorSpace: video?.color_space ?? 'missing',
        colorRange: video?.color_range ?? 'missing',
        audioCodec: audio?.codec_name ?? 'missing',
        audioSampleRate: Number(audio?.sample_rate ?? 0),
        audioChannels: audio?.channels ?? 0,
        fastStart,
        fileMegabytes: round(fileBytes / 1024 ** 2, 2),
        bitrateKbps,
        scenes: scenes.length,
        captionWords: narration.words.length,
        narrationSource: narration.source,
      },
      artifacts: [repoRelative(ctx.repoRoot, outputLocation)],
      notes: [
        'Scene images are synthetic plates with film grain, not generated images.',
        'Caption timings are approximated from sentence lengths; production uses speech recognition.',
        ...(narration.source === 'tone'
          ? [
              'No Kokoro narration was found, so a placeholder tone was used. Run voice-kokoro first.',
            ]
          : []),
      ],
    };
  },
};
