import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = 3;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

/** Encodes tightly packed 8-bit RGB pixels as a PNG file. */
export function encodePngRgb(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * CHANNELS;
  if (rgb.length !== stride * height) {
    throw new RangeError(`expected ${stride * height} bytes of RGB data, got ${rgb.length}`);
  }

  // Each scanline is prefixed with its filter type; 0 means "no filter".
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // colour type: truecolour RGB

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export type Rgb = readonly [red: number, green: number, blue: number];

export interface ScenePalette {
  top: Rgb;
  bottom: Rgb;
  glow: Rgb;
}

/** Deterministic pseudo-random numbers (mulberry32), so generated plates are reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/**
 * Paints a synthetic scene: a vertical gradient, one soft light source and film grain.
 * The grain is deliberate. It gives the video encoder realistic entropy, which a clean gradient
 * would not, so render timings are closer to what generated images will cost.
 */
export function paintScenePlate(
  width: number,
  height: number,
  palette: ScenePalette,
  seed: number,
): Uint8Array {
  const random = mulberry32(seed);
  const rgb = new Uint8Array(width * height * CHANNELS);
  const glowX = width * (0.25 + 0.5 * random());
  const glowY = height * (0.2 + 0.4 * random());
  const glowRadius = Math.min(width, height) * 0.75;
  const [topR, topG, topB] = palette.top;
  const [bottomR, bottomG, bottomB] = palette.bottom;
  const [glowR, glowG, glowB] = palette.glow;

  for (let y = 0; y < height; y += 1) {
    const t = height === 1 ? 0 : y / (height - 1);
    const baseR = topR + (bottomR - topR) * t;
    const baseG = topG + (bottomG - topG) * t;
    const baseB = topB + (bottomB - topB) * t;
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - glowX, y - glowY) / glowRadius;
      const glow = Math.max(0, 1 - distance) ** 2 * 0.8;
      const grain = (random() - 0.5) * 18;
      const offset = (y * width + x) * CHANNELS;
      rgb[offset] = clampByte(baseR + (glowR - baseR) * glow + grain);
      rgb[offset + 1] = clampByte(baseG + (glowG - baseG) * glow + grain);
      rgb[offset + 2] = clampByte(baseB + (glowB - baseB) * glow + grain);
    }
  }
  return rgb;
}
