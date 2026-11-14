import { zlibSync, unzlibSync } from 'fflate';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

// Precompute CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function isPngBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

export function encodeBase64Utf8(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < utf8.length; i += chunkSize) {
    const slice = utf8.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function decodeBase64Utf8(base64: string): string {
  const cleaned = base64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

interface PngChunk {
  type: string;
  data: Uint8Array;
}

export function parsePngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPngBuffer(bytes)) {
    throw new Error('無效的 PNG 檔案標頭');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error(`PNG 區塊 ${type} 長度異常或檔案已損毀`);
    }
    const data = bytes.slice(dataStart, dataEnd);
    chunks.push({ type, data });
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }

  return chunks;
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function encodeLatin1(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function readPngTextChunks(bytes: Uint8Array): Record<string, string> {
  const chunks = parsePngChunks(bytes);
  const result: Record<string, string> = {};

  for (const chunk of chunks) {
    if (chunk.type === 'tEXt') {
      const nulIndex = chunk.data.indexOf(0);
      if (nulIndex > 0) {
        const key = decodeLatin1(chunk.data.subarray(0, nulIndex));
        const val = decodeLatin1(chunk.data.subarray(nulIndex + 1));
        result[key] = val;
      }
    } else if (chunk.type === 'zTXt') {
      const nulIndex = chunk.data.indexOf(0);
      if (nulIndex > 0 && nulIndex + 2 <= chunk.data.length) {
        const key = decodeLatin1(chunk.data.subarray(0, nulIndex));
        const compressionMethod = chunk.data[nulIndex + 1];
        if (compressionMethod === 0) {
          try {
            const decompressed = unzlibSync(chunk.data.subarray(nulIndex + 2));
            result[key] = decodeLatin1(decompressed);
          } catch {
            // Skip malformed zTXt chunk
          }
        }
      }
    } else if (chunk.type === 'iTXt') {
      const nul1 = chunk.data.indexOf(0);
      if (nul1 > 0 && nul1 + 3 < chunk.data.length) {
        const key = decodeLatin1(chunk.data.subarray(0, nul1));
        const compFlag = chunk.data[nul1 + 1];
        const compMethod = chunk.data[nul1 + 2];
        const nul2 = chunk.data.indexOf(0, nul1 + 3);
        if (nul2 !== -1) {
          const nul3 = chunk.data.indexOf(0, nul2 + 1);
          if (nul3 !== -1) {
            const textBytes = chunk.data.subarray(nul3 + 1);
            if (compFlag === 1 && compMethod === 0) {
              try {
                const decompressed = unzlibSync(textBytes);
                result[key] = new TextDecoder('utf-8').decode(decompressed);
              } catch {
                // Skip malformed iTXt
              }
            } else if (compFlag === 0) {
              result[key] = new TextDecoder('utf-8').decode(textBytes);
            }
          }
        }
      }
    }
  }

  return result;
}

function buildChunkBytes(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);

  const crcInput = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return out;
}

function makeTextChunkData(key: string, value: string): Uint8Array {
  const keyBytes = encodeLatin1(key);
  const valBytes = encodeLatin1(value);
  const data = new Uint8Array(keyBytes.length + 1 + valBytes.length);
  data.set(keyBytes, 0);
  data[keyBytes.length] = 0;
  data.set(valBytes, keyBytes.length + 1);
  return data;
}

export function writePngTextChunks(
  bytes: Uint8Array,
  newTextChunks: Record<string, string>,
  stripKeys: string[] = ['chara', 'ccv3'],
): Uint8Array {
  const existingChunks = parsePngChunks(bytes);
  const stripSet = new Set([...stripKeys, ...Object.keys(newTextChunks)]);
  const outputChunks: Uint8Array[] = [];

  for (const chunk of existingChunks) {
    if (chunk.type === 'IEND') continue;
    if (chunk.type === 'tEXt' || chunk.type === 'zTXt' || chunk.type === 'iTXt') {
      const nulIndex = chunk.data.indexOf(0);
      if (nulIndex > 0) {
        const key = decodeLatin1(chunk.data.subarray(0, nulIndex));
        if (stripSet.has(key)) {
          continue;
        }
      }
    }
    outputChunks.push(buildChunkBytes(chunk.type, chunk.data));
  }

  for (const [key, value] of Object.entries(newTextChunks)) {
    const data = makeTextChunkData(key, value);
    outputChunks.push(buildChunkBytes('tEXt', data));
  }

  outputChunks.push(buildChunkBytes('IEND', new Uint8Array(0)));

  const totalLength =
    PNG_SIGNATURE.length + outputChunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  result.set(PNG_SIGNATURE, 0);

  let offset = PNG_SIGNATURE.length;
  for (const chunkBytes of outputChunks) {
    result.set(chunkBytes, offset);
    offset += chunkBytes.length;
  }

  return result;
}

/**
 * Generates a clean, valid PNG image (RGBA gradient card) in pure TypeScript
 * so JSON -> PNG conversion works reliably even in headless / Node environments
 * without an external image file.
 */
export function createFallbackAvatarPng(width = 256, height = 340, seedText = 'ST'): Uint8Array {
  // Compute a deterministic hue shift from seedText
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  const accentR = 30 + (hash % 45);
  const accentG = 64 + ((hash >> 4) % 70);
  const accentB = 135 + ((hash >> 8) % 95);

  const stride = 1 + width * 4;
  const raw = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // Filter type 0 (None)
    const ty = y / height;

    for (let x = 0; x < width; x++) {
      const tx = x / width;
      const px = rowStart + 1 + x * 4;

      // Subtle architectural frame + radial glow
      const dx = tx - 0.5;
      const dy = ty - 0.42;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const glow = Math.max(0, 1 - dist * 1.45);

      const border = x < 8 || x >= width - 8 || y < 8 || y >= height - 8;
      const innerLine =
        (x === 16 || x === width - 17) && y >= 16 && y <= height - 17 ||
        (y === 16 || y === height - 17) && x >= 16 && x <= width - 17;

      // Geometric emblem diamond in center
      const diamond = Math.abs(tx - 0.5) * 1.2 + Math.abs(ty - 0.44) * 0.9;
      const isEmblemRing = diamond > 0.16 && diamond < 0.185;
      const isEmblemCore = diamond < 0.08;

      let r = 15 + Math.round(glow * accentR * 0.9);
      let g = 23 + Math.round(glow * accentG * 0.9);
      let b = 42 + Math.round(glow * accentB * 0.9);

      if (border) {
        r = 30;
        g = 41;
        b = 59;
      } else if (innerLine) {
        r = 71;
        g = 85;
        b = 105;
      } else if (isEmblemRing || isEmblemCore) {
        r = Math.min(255, accentR + 110);
        g = Math.min(255, accentG + 120);
        b = Math.min(255, accentB + 60);
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = zlibSync(raw, { level: 6 });

  const ihdrChunk = buildChunkBytes('IHDR', ihdr);
  const idatChunk = buildChunkBytes('IDAT', idat);
  const iendChunk = buildChunkBytes('IEND', new Uint8Array(0));

  const out = new Uint8Array(
    PNG_SIGNATURE.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let offset = 0;
  out.set(PNG_SIGNATURE, offset);
  offset += PNG_SIGNATURE.length;
  out.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  out.set(idatChunk, offset);
  offset += idatChunk.length;
  out.set(iendChunk, offset);

  return out;
}
