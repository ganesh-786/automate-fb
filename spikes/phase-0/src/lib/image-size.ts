export interface ImageInfo {
  format: 'png' | 'jpeg';
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** JPEG markers that carry no length field. */
const isStandaloneMarker = (marker: number): boolean =>
  marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);

/** Start-of-frame markers hold the image dimensions. C4, C8 and CC are not frame headers. */
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function readJpegSize(bytes: Buffer): ImageInfo | undefined {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes.readUInt8(offset) !== 0xff) return undefined;
    const marker = bytes.readUInt8(offset + 1);
    if (isStandaloneMarker(marker)) {
      offset += 2;
      continue;
    }
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.length) return undefined;
      return {
        format: 'jpeg',
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return undefined;
}

/** Reads the pixel dimensions from a PNG or JPEG header. Returns undefined for anything else. */
export function readImageInfo(bytes: Buffer): ImageInfo | undefined {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8) {
    return readJpegSize(bytes);
  }
  return undefined;
}
