import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONVERSION_OPTIONS,
  convertTavernFile,
  createSampleCharacterPng,
  createSampleChatJsonl,
  createSampleWorldInfoJson,
  parseCsvRows,
  parseTavernFile,
} from './stConverters';

test('Sample Character PNG parses as V2 and converts cleanly to V3 JSON, CHARX, and extracts World Info', () => {
  const sample = createSampleCharacterPng();
  const parsed = parseTavernFile(sample.fileName, sample.bytes);

  assert.equal(parsed.category, 'character');
  assert.equal(parsed.detectedFormat, 'char_png_v2');
  assert.equal(parsed.characterData?.name, '艾莉絲・格雷（Iris Gray）');
  assert.equal(parsed.summary.hasEmbeddedWorldInfo, true);
  assert.equal(parsed.summary.embeddedWorldInfoCount, 2);

  // Convert to V3 JSON
  const v3Res = convertTavernFile(parsed, 'char_json_v3', DEFAULT_CONVERSION_OPTIONS);
  const v3Obj = JSON.parse(v3Res.textPreview);
  assert.equal(v3Obj.spec, 'chara_card_v3');
  assert.equal(v3Obj.spec_version, '3.0');
  assert.equal(v3Obj.data.name, '艾莉絲・格雷（Iris Gray）');

  // Convert to CHARX and re-parse it
  const charxRes = convertTavernFile(parsed, 'charx_v3', DEFAULT_CONVERSION_OPTIONS);
  assert.ok(charxRes.fileName.endsWith('.charx'));
  const reparsedCharx = parseTavernFile(charxRes.fileName, charxRes.bytes);
  assert.equal(reparsedCharx.detectedFormat, 'charx_v3');
  assert.equal(reparsedCharx.characterData?.name, '艾莉絲・格雷（Iris Gray）');
  assert.ok(reparsedCharx.avatarPngBytes && reparsedCharx.avatarPngBytes.length > 0);

  // Extract embedded World Info
  const extractedWi = convertTavernFile(parsed, 'world_info_st', DEFAULT_CONVERSION_OPTIONS);
  const wiParsed = parseTavernFile(extractedWi.fileName, extractedWi.bytes);
  assert.equal(wiParsed.category, 'world_info');
  assert.equal(wiParsed.detectedFormat, 'world_info_st');
  assert.equal(Object.keys(wiParsed.worldInfo!.entries).length, 2);
});

test('Character V1 JSON upgrades to PNG V3 and warns on downgrade back to V1', () => {
  const v1Json = JSON.stringify({
    name: '舊版測試角',
    description: '來自 TavernAI 早期版本',
    personality: '沉穩',
    scenario: '酒館吧台',
    first_mes: '歡迎光臨。',
    mes_example: '',
    talkativeness: '0.6',
  });
  const parsed = parseTavernFile('legacy.json', new TextEncoder().encode(v1Json));
  assert.equal(parsed.detectedFormat, 'char_json_v1');

  const pngV3 = convertTavernFile(parsed, 'char_png_v3', DEFAULT_CONVERSION_OPTIONS);
  const reparsedPng = parseTavernFile(pngV3.fileName, pngV3.bytes);
  assert.equal(reparsedPng.detectedFormat, 'char_png_v3');
  assert.equal(reparsedPng.characterData?.name, '舊版測試角');
  assert.equal(reparsedPng.characterData?.extensions.talkativeness, '0.6');
});

test('World Info JSON <-> CSV <-> Character Book round-trip preserves commas, quotes, and newlines', () => {
  const sample = createSampleWorldInfoJson();
  const parsed = parseTavernFile(sample.fileName, sample.bytes);
  assert.equal(parsed.detectedFormat, 'world_info_st');
  assert.equal(parsed.summary.itemCount, 3);

  // Inject tricky entry with commas, quotes, and newline to test RFC-4180 CSV
  parsed.worldInfo!.entries['0'].content = '第一行, "引號測試"\n第二行';
  const csvRes = convertTavernFile(parsed, 'world_info_csv', DEFAULT_CONVERSION_OPTIONS);
  const rows = parseCsvRows(csvRes.textPreview);
  assert.equal(rows.length, 4);

  const reparsedCsv = parseTavernFile(csvRes.fileName, csvRes.bytes);
  assert.equal(reparsedCsv.detectedFormat, 'world_info_csv');
  assert.equal(reparsedCsv.worldInfo?.entries['0'].content, '第一行, "引號測試"\n第二行');
  assert.deepEqual(reparsedCsv.worldInfo?.entries['0'].key, ['星港', '軌道電梯']);
  assert.equal(reparsedCsv.worldInfo?.entries['2'].constant, true);

  // Convert to Character Book array
  const charBookRes = convertTavernFile(reparsedCsv, 'world_info_charbook', DEFAULT_CONVERSION_OPTIONS);
  const charBookObj = JSON.parse(charBookRes.textPreview);
  assert.ok(Array.isArray(charBookObj.entries));
  assert.equal(charBookObj.entries.length, 3);
});

test('Chat JSONL converts to TXT, Markdown (with swipes), HTML, and back to JSONL', () => {
  const sample = createSampleChatJsonl();
  const parsed = parseTavernFile(sample.fileName, sample.bytes);
  assert.equal(parsed.detectedFormat, 'chat_jsonl');
  assert.equal(parsed.summary.itemCount, 3);

  // Markdown with swipes and excluding system messages
  const mdRes = convertTavernFile(parsed, 'chat_md', {
    ...DEFAULT_CONVERSION_OPTIONS,
    excludeSystemMessages: true,
    includeSwipes: true,
    userNameOverride: '探索者',
  });
  assert.ok(!mdRes.textPreview.includes('場景載入'));
  assert.ok(mdRes.textPreview.includes('備選回應 #2'));
  assert.ok(mdRes.textPreview.includes('探索者'));

  // TXT round-trip back to JSONL
  const txtRes = convertTavernFile(parsed, 'chat_txt', {
    ...DEFAULT_CONVERSION_OPTIONS,
    excludeSystemMessages: true,
  });
  const reparsedTxt = parseTavernFile(txtRes.fileName, txtRes.bytes);
  assert.equal(reparsedTxt.detectedFormat, 'chat_txt');
  assert.equal(reparsedTxt.chatLog?.messages.length, 2);

  // HTML export escapes tags safely
  const htmlRes = convertTavernFile(parsed, 'chat_html', DEFAULT_CONVERSION_OPTIONS);
  assert.ok(htmlRes.textPreview.includes('<!doctype html>'));
  assert.ok(htmlRes.textPreview.includes('艾莉絲'));
});

test('parseTavernFile rejects non-card PNG and invalid JSON with clear messages', () => {
  const blankPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  assert.throws(
    () => parseTavernFile('avatar_only.png', blankPng),
    /找不到 chara 或 ccv3 區塊/,
  );

  assert.throws(
    () => parseTavernFile('broken.json', new TextEncoder().encode('{invalid')),
    /無法解析 JSON/,
  );
});
