import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleMalformedPreset, parseRelaxedJson } from './presetRepair';
import {
  DEFAULT_CONVERSION_OPTIONS,
  convertTavernFile,
  parseTavernFile,
} from './stConverters';

test('parseRelaxedJson recovers markdown fences, comments, smart quotes, and trailing commas', () => {
  const broken = `\`\`\`json
  {
    // comment line
    "temperature": 0.8,
    /* block
       comment */
    “top_p”: 0.95,
    "items": [1, 2, ],
  }
  \`\`\``;
  const { parsed, syntaxFixes } = parseRelaxedJson(broken);
  const obj = parsed as Record<string, unknown>;
  assert.equal(obj.temperature, 0.8);
  assert.equal(obj.top_p, 0.95);
  assert.deepEqual(obj.items, [1, 2]);
  assert.ok(syntaxFixes.length >= 3);
});

test('Malformed community preset auto-repairs aliases, types, prompt_order, and chatHistory marker', () => {
  const sample = createSampleMalformedPreset();
  const parsed = parseTavernFile(sample.fileName, sample.bytes);

  assert.equal(parsed.category, 'preset');
  assert.equal(parsed.detectedFormat, 'preset_repaired');
  assert.ok(parsed.presetData);

  const { chatPreset, repairIssues } = parsed.presetData!;
  assert.ok(repairIssues.length >= 5);
  assert.equal(chatPreset.temperature, 0.85);
  assert.equal(chatPreset.top_p, 0.92);
  assert.equal(chatPreset.openai_max_tokens, 2048);
  assert.equal(chatPreset.openai_max_context, 32768);
  assert.equal(chatPreset.repetition_penalty, 1.08);
  assert.equal(chatPreset.stream_openai, true);

  // Verify role 'model' normalized to 'assistant' and chatHistory marker added
  const nudge = chatPreset.prompts.find((p) => p.identifier === 'jailbreak_nudge');
  assert.equal(nudge?.role, 'assistant');
  assert.ok(chatPreset.prompts.some((p) => p.identifier === 'chatHistory'));

  // Verify prompt_order synced without orphaned ghost ID
  const orderIds = chatPreset.prompt_order[0].order.map((o) => o.identifier);
  assert.ok(!orderIds.includes('non_existent_ghost_id'));
  assert.ok(orderIds.includes('jailbreak_nudge'));
  assert.ok(orderIds.includes('chatHistory'));

  // Exported Chat Completion JSON re-parses cleanly with 0 repair issues!
  const exported = convertTavernFile(parsed, 'preset_chat', DEFAULT_CONVERSION_OPTIONS);
  const reparsed = parseTavernFile(exported.fileName, exported.bytes);
  assert.equal(reparsed.category, 'preset');
  assert.equal(reparsed.detectedFormat, 'preset_chat');
  assert.equal(reparsed.presetData?.repairIssues.length, 0);
});

test('Wrapped preset { preset: ... } and standalone prompts array are recovered cleanly', () => {
  const wrapped = JSON.stringify({
    preset: {
      temperature: '1.1',
      prompts: [
        { name: 'Only Prompt', role: 'system', content: 'Hello world' },
      ],
    },
  });
  const parsedWrapped = parseTavernFile('wrapped.json', new TextEncoder().encode(wrapped));
  assert.equal(parsedWrapped.category, 'preset');
  assert.equal(parsedWrapped.presetData?.chatPreset.temperature, 1.1);
  assert.ok(
    parsedWrapped.presetData?.repairIssues.some((i) => i.field === 'preset'),
  );

  const promptsOnly = JSON.stringify([
    { name: 'First', role: 'system', content: 'System instruction' },
  ]);
  const parsedArray = parseTavernFile('prompts_only.json', new TextEncoder().encode(promptsOnly));
  assert.equal(parsedArray.category, 'preset');
  assert.ok(parsedArray.presetData?.chatPreset.prompts.some((p) => p.content === 'System instruction'));
  assert.ok(parsedArray.presetData?.chatPreset.prompts.some((p) => p.identifier === 'chatHistory'));
});

test('Chat preset converts to Text Completion preset and Markdown', () => {
  const sample = createSampleMalformedPreset();
  const parsed = parseTavernFile(sample.fileName, sample.bytes);
  const textRes = convertTavernFile(parsed, 'preset_text', DEFAULT_CONVERSION_OPTIONS);
  const textObj = JSON.parse(textRes.textPreview);
  assert.equal(textObj.temp, 0.85);
  assert.equal(textObj.rep_pen, 1.08);
  assert.equal(textObj.max_length, 2048);
  assert.equal(textObj.max_context, 32768);
  assert.ok(textRes.warnings.length > 0);

  const mdRes = convertTavernFile(parsed, 'preset_md', DEFAULT_CONVERSION_OPTIONS);
  assert.ok(mdRes.textPreview.includes('Temperature'));
  assert.ok(mdRes.textPreview.includes('主系統提示詞（破格式）'));
});
