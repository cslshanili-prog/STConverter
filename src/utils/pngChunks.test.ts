import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFallbackAvatarPng,
  decodeBase64Utf8,
  encodeBase64Utf8,
  isPngBuffer,
  parsePngChunks,
  readPngTextChunks,
  writePngTextChunks,
} from './pngChunks';

test('UTF-8 Base64 codec handles Traditional Chinese and emoji losslessly', () => {
  const sample = '艾莉絲・格雷｜霧港檔案館 🕯️ "quote" & newline\n第二行';
  const encoded = encodeBase64Utf8(sample);
  const decoded = decodeBase64Utf8(encoded);
  assert.equal(decoded, sample);
});

test('createFallbackAvatarPng produces valid PNG with IHDR, IDAT, IEND', () => {
  const png = createFallbackAvatarPng(64, 64, 'TestChar');
  assert.equal(isPngBuffer(png), true);
  const chunks = parsePngChunks(png);
  assert.deepEqual(
    chunks.map((c) => c.type),
    ['IHDR', 'IDAT', 'IEND'],
  );
});

test('writePngTextChunks embeds and replaces chara and ccv3 chunks cleanly', () => {
  const basePng = createFallbackAvatarPng(64, 64, 'Chara');
  const v2B64 = encodeBase64Utf8(JSON.stringify({ spec: 'chara_card_v2', data: { name: '測試角色' } }));
  const v3B64 = encodeBase64Utf8(JSON.stringify({ spec: 'chara_card_v3', data: { name: '測試角色V3' } }));

  const firstWrite = writePngTextChunks(basePng, { chara: v2B64 });
  const read1 = readPngTextChunks(firstWrite);
  assert.equal(decodeBase64Utf8(read1.chara), JSON.stringify({ spec: 'chara_card_v2', data: { name: '測試角色' } }));
  assert.equal(read1.ccv3, undefined);

  const secondWrite = writePngTextChunks(firstWrite, { ccv3: v3B64, chara: v2B64 });
  const read2 = readPngTextChunks(secondWrite);
  assert.equal(
    decodeBase64Utf8(read2.ccv3),
    JSON.stringify({ spec: 'chara_card_v3', data: { name: '測試角色V3' } }),
  );
  assert.equal(
    decodeBase64Utf8(read2.chara),
    JSON.stringify({ spec: 'chara_card_v2', data: { name: '測試角色' } }),
  );

  // Ensure IEND is still the final chunk
  const chunks = parsePngChunks(secondWrite);
  assert.equal(chunks[chunks.length - 1].type, 'IEND');
});
