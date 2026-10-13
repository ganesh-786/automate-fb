import { open } from 'node:fs/promises';

export interface Mp4Box {
  type: string;
  size: number;
  offset: number;
}

/** Lists the top-level boxes of an MP4 file without reading their payloads. */
export async function listTopLevelBoxes(path: string): Promise<Mp4Box[]> {
  const file = await open(path, 'r');
  try {
    const { size: fileSize } = await file.stat();
    const boxes: Mp4Box[] = [];
    const header = Buffer.alloc(16);
    let offset = 0;

    while (offset + 8 <= fileSize) {
      header.fill(0);
      await file.read(header, 0, header.length, offset);
      const type = header.toString('latin1', 4, 8);
      let size = header.readUInt32BE(0);
      if (size === 1) size = Number(header.readBigUInt64BE(8)); // 64-bit size follows the type
      if (size === 0) size = fileSize - offset; // box runs to the end of the file
      if (size < 8) break; // corrupt header: stop instead of looping forever
      boxes.push({ type, size, offset });
      offset += size;
    }
    return boxes;
  } finally {
    await file.close();
  }
}

/**
 * True when the `moov` index comes before the media data, so playback can begin before the
 * download finishes. Instagram requires this layout for Reels.
 */
export function hasFastStart(boxes: readonly Mp4Box[]): boolean {
  const moov = boxes.findIndex((box) => box.type === 'moov');
  const mdat = boxes.findIndex((box) => box.type === 'mdat');
  return moov !== -1 && mdat !== -1 && moov < mdat;
}
