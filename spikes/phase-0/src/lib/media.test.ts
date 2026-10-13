import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../harness/testing.ts';
import { readImageInfo } from './image-size.ts';
import { hasFastStart, listTopLevelBoxes } from './mp4.ts';
import { encodePngRgb, paintScenePlate } from './png.ts';

const PALETTE = { top: [20, 30, 60], bottom: [200, 120, 40], glow: [255, 240, 200] } as const;

function box(type: string, payloadBytes: number): Buffer {
  const buffer = Buffer.alloc(8 + payloadBytes);
  buffer.writeUInt32BE(buffer.length, 0);
  buffer.write(type, 4, 'latin1');
  return buffer;
}

async function mp4File(...boxes: Buffer[]): Promise<string> {
  const dir = await tempDir('mp4');
  const path = join(dir, 'sample.mp4');
  await writeFile(path, Buffer.concat(boxes));
  return path;
}

describe('encodePngRgb', () => {
  it('produces a PNG whose pixel data round-trips', () => {
    const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30]);
    const png = encodePngRgb(2, 2, rgb);

    expect(readImageInfo(png)).toEqual({ format: 'png', width: 2, height: 2 });

    // Layout: signature (8) + IHDR chunk (25), then the IDAT chunk: length, type, data, CRC.
    const idatLength = png.readUInt32BE(33);
    expect(png.toString('ascii', 37, 41)).toBe('IDAT');
    const scanlines = inflateSync(png.subarray(41, 41 + idatLength));
    expect([...scanlines]).toEqual([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 10, 20, 30]);
  });

  it('rejects pixel data of the wrong size', () => {
    expect(() => encodePngRgb(2, 2, new Uint8Array(5))).toThrow(RangeError);
  });
});

describe('paintScenePlate', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const first = paintScenePlate(32, 48, PALETTE, 7);
    expect(first.length).toBe(32 * 48 * 3);
    expect(paintScenePlate(32, 48, PALETTE, 7)).toEqual(first);
    expect(paintScenePlate(32, 48, PALETTE, 8)).not.toEqual(first);
  });
});

describe('readImageInfo', () => {
  it('reads the dimensions of a baseline JPEG', () => {
    const startOfImage = [0xff, 0xd8];
    const app0Segment = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]; // skipped by the reader
    // SOF0: length 11, 8-bit precision, height 0x0780 (1920), width 0x0438 (1080), 3 components
    const startOfFrame = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x07, 0x80, 0x04, 0x38, 0x03, 0x00];
    const jpeg = Buffer.from([...startOfImage, ...app0Segment, ...startOfFrame]);
    expect(readImageInfo(jpeg)).toEqual({ format: 'jpeg', width: 1080, height: 1920 });
  });

  it('returns undefined for unknown data', () => {
    expect(readImageInfo(Buffer.from('not an image at all, just text'))).toBeUndefined();
  });
});

describe('MP4 box inspection', () => {
  it('lists top-level boxes in file order', async () => {
    const boxes = await listTopLevelBoxes(
      await mp4File(box('ftyp', 8), box('moov', 40), box('mdat', 100)),
    );
    expect(boxes.map(({ type, size }) => ({ type, size }))).toEqual([
      { type: 'ftyp', size: 16 },
      { type: 'moov', size: 48 },
      { type: 'mdat', size: 108 },
    ]);
    expect(hasFastStart(boxes)).toBe(true);
  });

  it('detects a file whose index trails the media data', async () => {
    const boxes = await listTopLevelBoxes(
      await mp4File(box('ftyp', 8), box('mdat', 100), box('moov', 40)),
    );
    expect(hasFastStart(boxes)).toBe(false);
  });

  it('stops at a corrupt box header instead of looping', async () => {
    const corrupt = Buffer.alloc(8); // size 0 is "to end of file"; size 4 is invalid
    corrupt.writeUInt32BE(4, 0);
    corrupt.write('junk', 4, 'latin1');
    const boxes = await listTopLevelBoxes(await mp4File(box('ftyp', 8), corrupt));
    expect(boxes.map((b) => b.type)).toEqual(['ftyp']);
  });
});
