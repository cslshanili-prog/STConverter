import {
  ParsedPresetData,
  PresetPromptEntry,
  PresetPromptOrderBlock,
  PresetPromptOrderItem,
  PresetRepairIssue,
  SillyTavernChatPreset,
  SillyTavernTextPreset,
} from '../types/sillytavern';

export interface RelaxedJsonResult {
  parsed: unknown;
  syntaxFixes: string[];
}

/**
 * Recovers JSON from slightly malformed community presets:
 * - strips UTF-8 BOM & Markdown ```json ... ``` code fences
 * - normalizes curly/smart quotes outside or as JSON delimiters
 * - strips // single-line and /* *\/ block comments outside strings
 * - removes trailing commas before } or ]
 */
export function parseRelaxedJson(rawText: string): RelaxedJsonResult {
  const syntaxFixes: string[] = [];
  let text = rawText.replace(/^\uFEFF/, '').trim();

  // Strip Markdown code fence wrapper if present
  const fenceMatch = text.match(/^```(?:json|jsonc|json5)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```\s*$/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
    syntaxFixes.push('已移除外層 Markdown 程式碼圍欄（```json）');
  }

  // Try strict parse first before mutating
  try {
    return { parsed: JSON.parse(text), syntaxFixes };
  } catch {
    // Proceed to relaxed cleanup
  }

  // Strip comments and trailing commas using a string-aware scanner
  let out = '';
  let inString = false;
  let quoteChar = '"';
  let removedComment = false;
  let removedTrailingComma = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inString) {
      if (ch === '\\' && i + 1 < text.length) {
        out += ch + text[i + 1];
        i++;
        continue;
      }
      if (ch === quoteChar) {
        inString = false;
        out += '"';
      } else if (ch === '\n' || ch === '\r') {
        // Escape unescaped newline inside JSON string
        out += ch === '\n' ? '\\n' : '\\r';
        syntaxFixes.push('已轉義字串內的未跳脫換行符');
      } else {
        out += ch;
      }
      continue;
    }

    // Outside string
    if (ch === '"' || ch === '“' || ch === '”') {
      inString = true;
      quoteChar = ch === '“' ? '”' : ch;
      if (ch === '“' || ch === '”') {
        syntaxFixes.push('已將全形中文引號修正為標準雙引號');
      }
      out += '"';
      continue;
    }

    // Single-line comment //
    if (ch === '/' && next === '/') {
      removedComment = true;
      i += 2;
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
        i++;
      }
      i--; // outer loop will advance past newline
      continue;
    }

    // Block comment /* ... */
    if (ch === '/' && next === '*') {
      removedComment = true;
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i++;
      }
      i++; // skip closing /
      continue;
    }

    // Trailing comma before } or ]
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') {
        removedTrailingComma = true;
        continue;
      }
    }

    out += ch;
  }

  if (removedComment) {
    syntaxFixes.push('已移除 JSON 內的註解（// 或 /* ... */）');
  }
  if (removedTrailingComma) {
    syntaxFixes.push('已移除多餘的尾隨逗號（trailing comma）');
  }

  const parsed = JSON.parse(out);
  return { parsed, syntaxFixes: Array.from(new Set(syntaxFixes)) };
}

const DEFAULT_SYSTEM_MARKERS: PresetPromptEntry[] = [
  {
    identifier: 'main',
    name: 'Main Prompt',
    system_prompt: true,
    role: 'system',
    content:
      "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.",
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
  },
  {
    identifier: 'worldInfoBefore',
    name: 'World Info (before)',
    system_prompt: true,
    role: 'system',
    content: '',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    marker: true,
  },
  {
    identifier: 'personaDescription',
    name: 'Persona Description',
    system_prompt: true,
    role: 'system',
    content: '',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    marker: true,
  },
  {
    identifier: 'charDescription',
    name: 'Char Description',
    system_prompt: true,
    role: 'system',
    content: '',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    marker: true,
  },
  {
    identifier: 'charPersonality',
    name: 'Char Personality',
    system_prompt: true,
    role: 'system',
    content: '',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    marker: true,
  },
  {
    identifier: 'scenario',
    name: 'Scenario',
    system_prompt: true,
    role: 'system',
    content: '',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    marker: true,
  },
  {
    identifier: 'worldInfoAfter',
    name: 'World Info (after)',
    system_prompt: true,
    role: 'system',
    content: '',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    marker: true,
  },
  {
    identifier: 'dialogueExamples',
    name: 'Chat Examples',
    system_prompt: true,
    role: 'system',
    content: '',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    marker: true,
  },
  {
    identifier: 'chatHistory',
    name: 'Chat History',
    system_prompt: true,
    role: 'system',
    content: '',
    injection_position: 0,
    injection_depth: 4,
    injection_order: 100,
    forbid_overrides: false,
    marker: true,
  },
];

const CORE_MARKER_IDS = new Set([
  'worldInfoBefore',
  'personaDescription',
  'charDescription',
  'charPersonality',
  'scenario',
  'worldInfoAfter',
  'dialogueExamples',
  'chatHistory',
]);

export function createDefaultChatPreset(): SillyTavernChatPreset {
  return {
    chat_completion_source: 'openai',
    openai_model: 'gpt-4o',
    temperature: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    top_p: 1,
    top_k: 0,
    top_a: 0,
    min_p: 0,
    repetition_penalty: 1,
    openai_max_context: 16384,
    openai_max_tokens: 1024,
    wrap_in_quotes: false,
    names_behavior: 0,
    send_if_empty: '',
    impersonation_prompt:
      '[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don\'t write as {{char}} or describe {{char}}\'s actions.]',
    new_chat_prompt: '[Start a new Chat]',
    new_group_chat_prompt: '[Start a new group chat. Group members: {{group}}]',
    new_example_chat_prompt: '[Example Chat]',
    continue_nudge_prompt:
      '[Continue the following message. Do not include any parts of the original message. Use capitalization and punctuation as if your reply is a part of the original message: {{lastChatMessage}}]',
    bias_preset_selected: 'Default (none)',
    max_context_unlocked: true,
    wi_format: '{0}\n',
    scenario_format: '{{scenario}}',
    personality_format: '{{personality}}',
    group_nudge_prompt: '[Write the next reply only as {{char}}.]',
    stream_openai: true,
    prompts: DEFAULT_SYSTEM_MARKERS.map((p) => ({ ...p })),
    prompt_order: [
      {
        character_id: 100001,
        order: DEFAULT_SYSTEM_MARKERS.map((p) => ({
          identifier: p.identifier,
          enabled: true,
        })),
      },
    ],
  };
}

export function isLikelyPresetObject(obj: Record<string, unknown>): boolean {
  const presetIndicators = [
    'prompts',
    'prompt_order',
    'temperature',
    'temp',
    'openai_max_context',
    'openai_max_tokens',
    'top_p',
    'rep_pen',
    'repetition_penalty',
    'chat_completion_source',
    'impersonation_prompt',
    'continue_nudge_prompt',
    'max_context',
    'max_length',
    'sampler_order',
    'preset',
    'settings',
  ];
  let score = 0;
  for (const key of presetIndicators) {
    if (key in obj) score++;
  }
  if (Array.isArray(obj.prompts) || Array.isArray(obj.prompt_order)) {
    score += 2;
  }
  // Check wrapped preset `{ preset: { ... } }` or `{ settings: { ... } }`
  if (obj.preset && typeof obj.preset === 'object' && !Array.isArray(obj.preset)) {
    if (isLikelyPresetObject(obj.preset as Record<string, unknown>)) return true;
  }
  if (obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings)) {
    if (isLikelyPresetObject(obj.settings as Record<string, unknown>)) return true;
  }
  return score >= 2;
}

function coerceNumber(
  raw: unknown,
  field: string,
  fallback: number,
  min: number,
  max: number,
  issues: PresetRepairIssue[],
): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  let num: number;
  if (typeof raw === 'number') {
    num = raw;
  } else if (typeof raw === 'string') {
    const parsed = Number(raw.trim());
    if (!Number.isFinite(parsed)) {
      issues.push({
        kind: 'type',
        field,
        message: `欄位 ${field} 的值「${raw}」無法辨識為數字，已重設為預設值 ${fallback}`,
      });
      return fallback;
    }
    num = parsed;
    issues.push({
      kind: 'type',
      field,
      message: `已將 ${field} 的字串數值 "${raw}" 自動轉型為數字 ${num}`,
    });
  } else {
    issues.push({
      kind: 'type',
      field,
      message: `欄位 ${field} 型別異常，已重設為預設值 ${fallback}`,
    });
    return fallback;
  }

  if (!Number.isFinite(num)) {
    issues.push({
      kind: 'range',
      field,
      message: `欄位 ${field} 數值無效，已重設為 ${fallback}`,
    });
    return fallback;
  }

  if (num < min || num > max) {
    const clamped = Math.min(max, Math.max(min, num));
    issues.push({
      kind: 'range',
      field,
      message: `欄位 ${field} 超出合理範圍 (${min}–${max})，已從 ${num} 修正為 ${clamped}`,
    });
    return clamped;
  }

  return num;
}

function coerceBoolean(
  raw: unknown,
  field: string,
  fallback: boolean,
  issues: PresetRepairIssue[],
): boolean {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      issues.push({
        kind: 'type',
        field,
        message: `已將 ${field} 的字串 "${raw}" 轉型為布林值 true`,
      });
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      issues.push({
        kind: 'type',
        field,
        message: `已將 ${field} 的字串 "${raw}" 轉型為布林值 false`,
      });
      return false;
    }
  }
  if (typeof raw === 'number') {
    issues.push({
      kind: 'type',
      field,
      message: `已將 ${field} 的數字 ${raw} 轉型為布林值 ${Boolean(raw)}`,
    });
    return Boolean(raw);
  }
  return fallback;
}

export function repairAndNormalizePreset(
  rawInput: unknown,
  fileName: string,
  syntaxFixes: string[] = [],
): ParsedPresetData {
  const issues: PresetRepairIssue[] = syntaxFixes.map((msg) => ({
    kind: 'syntax',
    field: 'JSON',
    message: msg,
  }));

  let src: Record<string, unknown>;
  if (Array.isArray(rawInput)) {
    // Handle case where user uploaded ONLY a prompts array `[ { name, role, content }, ... ]`
    issues.push({
      kind: 'structure',
      field: 'prompts',
      message: '偵測到純 Prompt 陣列片段，已自動封裝為完整 SillyTavern Chat Completion 預設結構',
    });
    src = { prompts: rawInput };
  } else if (rawInput && typeof rawInput === 'object') {
    const obj = rawInput as Record<string, unknown>;
    if (obj.preset && typeof obj.preset === 'object' && !Array.isArray(obj.preset)) {
      issues.push({
        kind: 'structure',
        field: 'preset',
        message: '偵測到外層 "preset" 包裝物件，已自動解包至標準頂層結構',
      });
      src = obj.preset as Record<string, unknown>;
    } else if (obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings)) {
      issues.push({
        kind: 'structure',
        field: 'settings',
        message: '偵測到外層 "settings" 包裝物件，已自動解包至標準頂層結構',
      });
      src = obj.settings as Record<string, unknown>;
    } else {
      src = { ...obj };
    }
  } else {
    throw new Error('預設檔案內容必須為 JSON 物件或 Prompt 陣列');
  }

  const isTextPreset =
    'temp' in src || 'rep_pen' in src || 'max_length' in src || 'sampler_order' in src;
  const hasChatFields =
    'prompts' in src ||
    'prompt_order' in src ||
    'openai_max_tokens' in src ||
    'chat_completion_source' in src;

  const sourceKind: ParsedPresetData['sourceKind'] =
    isTextPreset && !hasChatFields
      ? 'text_completion'
      : hasChatFields || 'temperature' in src
        ? 'chat_completion'
        : 'fragment';

  const defaults = createDefaultChatPreset();

  // Map common community/TextGen/OpenAI aliases -> SillyTavern Chat Completion keys
  const resolveAlias = (
    primaryKey: string,
    aliases: string[],
  ): unknown => {
    if (src[primaryKey] !== undefined) return src[primaryKey];
    for (const alias of aliases) {
      if (src[alias] !== undefined) {
        issues.push({
          kind: 'alias',
          field: primaryKey,
          message: `已將非標準／別名欄位 "${alias}" 自動對應為酒館標準欄位 "${primaryKey}"`,
        });
        return src[alias];
      }
    }
    return undefined;
  };

  const chatPreset: SillyTavernChatPreset = {
    ...defaults,
    chat_completion_source:
      typeof src.chat_completion_source === 'string'
        ? src.chat_completion_source
        : defaults.chat_completion_source,
    openai_model:
      typeof src.openai_model === 'string' ? src.openai_model : defaults.openai_model,
    temperature: coerceNumber(
      resolveAlias('temperature', ['temp']),
      'temperature',
      defaults.temperature,
      0,
      2,
      issues,
    ),
    top_p: coerceNumber(src.top_p, 'top_p', defaults.top_p, 0, 1, issues),
    top_k: coerceNumber(src.top_k, 'top_k', defaults.top_k, 0, 500, issues),
    top_a: coerceNumber(src.top_a, 'top_a', defaults.top_a, 0, 1, issues),
    min_p: coerceNumber(src.min_p, 'min_p', defaults.min_p, 0, 1, issues),
    frequency_penalty: coerceNumber(
      resolveAlias('frequency_penalty', ['freq_pen', 'freq_penalty']),
      'frequency_penalty',
      defaults.frequency_penalty,
      -2,
      2,
      issues,
    ),
    presence_penalty: coerceNumber(
      resolveAlias('presence_penalty', ['pres_pen', 'pres_penalty']),
      'presence_penalty',
      defaults.presence_penalty,
      -2,
      2,
      issues,
    ),
    repetition_penalty: coerceNumber(
      resolveAlias('repetition_penalty', ['rep_pen', 'repeat_penalty']),
      'repetition_penalty',
      defaults.repetition_penalty,
      0.5,
      2,
      issues,
    ),
    openai_max_context: coerceNumber(
      resolveAlias('openai_max_context', ['max_context', 'context_length', 'max_context_length']),
      'openai_max_context',
      defaults.openai_max_context,
      512,
      2000000,
      issues,
    ),
    openai_max_tokens: coerceNumber(
      resolveAlias('openai_max_tokens', ['max_tokens', 'max_new_tokens', 'max_length']),
      'openai_max_tokens',
      defaults.openai_max_tokens,
      16,
      131072,
      issues,
    ),
    stream_openai: coerceBoolean(
      resolveAlias('stream_openai', ['stream', 'streaming']),
      'stream_openai',
      defaults.stream_openai,
      issues,
    ),
    wrap_in_quotes: coerceBoolean(
      src.wrap_in_quotes,
      'wrap_in_quotes',
      defaults.wrap_in_quotes,
      issues,
    ),
    max_context_unlocked: coerceBoolean(
      src.max_context_unlocked,
      'max_context_unlocked',
      defaults.max_context_unlocked,
      issues,
    ),
    names_behavior: coerceNumber(src.names_behavior, 'names_behavior', defaults.names_behavior, -1, 2, issues),
    send_if_empty: typeof src.send_if_empty === 'string' ? src.send_if_empty : defaults.send_if_empty,
    impersonation_prompt:
      typeof src.impersonation_prompt === 'string'
        ? src.impersonation_prompt
        : defaults.impersonation_prompt,
    new_chat_prompt:
      typeof src.new_chat_prompt === 'string' ? src.new_chat_prompt : defaults.new_chat_prompt,
    new_group_chat_prompt:
      typeof src.new_group_chat_prompt === 'string'
        ? src.new_group_chat_prompt
        : defaults.new_group_chat_prompt,
    new_example_chat_prompt:
      typeof src.new_example_chat_prompt === 'string'
        ? src.new_example_chat_prompt
        : defaults.new_example_chat_prompt,
    continue_nudge_prompt:
      typeof src.continue_nudge_prompt === 'string'
        ? src.continue_nudge_prompt
        : defaults.continue_nudge_prompt,
    bias_preset_selected:
      typeof src.bias_preset_selected === 'string'
        ? src.bias_preset_selected
        : defaults.bias_preset_selected,
    wi_format: typeof src.wi_format === 'string' ? src.wi_format : defaults.wi_format,
    scenario_format:
      typeof src.scenario_format === 'string' ? src.scenario_format : defaults.scenario_format,
    personality_format:
      typeof src.personality_format === 'string'
        ? src.personality_format
        : defaults.personality_format,
    group_nudge_prompt:
      typeof src.group_nudge_prompt === 'string'
        ? src.group_nudge_prompt
        : defaults.group_nudge_prompt,
    prompts: [],
    prompt_order: [],
  };

  // Preserve extra valid SillyTavern flags if present
  for (const extraKey of [
    'assistant_prefill',
    'assistant_impersonation',
    'claude_use_sysprompt',
    'use_makersuite_sysprompt',
    'squash_system_messages',
  ]) {
    if (src[extraKey] !== undefined) {
      chatPreset[extraKey] = src[extraKey];
    }
  }

  // Normalize prompts array
  const rawPrompts = Array.isArray(src.prompts) ? src.prompts : [];
  const usedIds = new Set<string>();
  const normalizedPrompts: PresetPromptEntry[] = [];
  let autoIdCounter = 1;
  let fixedPromptCount = 0;

  if (!Array.isArray(src.prompts)) {
    if (typeof src.system_prompt === 'string' && src.system_prompt.trim()) {
      issues.push({
        kind: 'structure',
        field: 'prompts',
        message: '偵測到獨立的 system_prompt 字串，已自動轉換並補齊 SillyTavern prompts 區塊',
      });
      normalizedPrompts.push({
        ...DEFAULT_SYSTEM_MARKERS[0],
        content: src.system_prompt,
      });
    } else {
      issues.push({
        kind: 'structure',
        field: 'prompts',
        message: '缺少 prompts 提示詞陣列，已自動補齊 SillyTavern 預設核心條目',
      });
      normalizedPrompts.push(...DEFAULT_SYSTEM_MARKERS.map((p) => ({ ...p })));
    }
  } else {
    rawPrompts.forEach((rawItem, idx) => {
      if (!rawItem || typeof rawItem !== 'object') {
        fixedPromptCount++;
        return;
      }
      const item = rawItem as Record<string, unknown>;
      let identifier =
        typeof item.identifier === 'string' && item.identifier.trim()
          ? item.identifier.trim()
          : '';
      if (!identifier) {
        identifier = `custom_prompt_${autoIdCounter++}`;
        fixedPromptCount++;
      }
      if (usedIds.has(identifier)) {
        identifier = `${identifier}_${idx}`;
        fixedPromptCount++;
      }
      usedIds.add(identifier);

      const rawRole = typeof item.role === 'string' ? item.role.toLowerCase().trim() : '';
      let role: 'system' | 'user' | 'assistant' = 'system';
      if (rawRole === 'user' || rawRole === 'assistant' || rawRole === 'system') {
        role = rawRole;
      } else if (rawRole === 'model' || rawRole === 'char') {
        role = 'assistant';
        fixedPromptCount++;
      } else if (rawRole !== '') {
        fixedPromptCount++;
      }

      const isMarker = Boolean(item.marker) || CORE_MARKER_IDS.has(identifier);
      const entry: PresetPromptEntry = {
        ...item,
        identifier,
        name:
          typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : `未命名提示詞 #${idx + 1}`,
        system_prompt:
          typeof item.system_prompt === 'boolean' ? item.system_prompt : role === 'system',
        role,
        content: typeof item.content === 'string' ? item.content : '',
        injection_position:
          typeof item.injection_position === 'number' ? item.injection_position : 0,
        injection_depth:
          typeof item.injection_depth === 'number' ? item.injection_depth : 4,
        injection_order:
          typeof item.injection_order === 'number' ? item.injection_order : 100,
        forbid_overrides:
          typeof item.forbid_overrides === 'boolean' ? item.forbid_overrides : false,
        ...(isMarker ? { marker: true } : {}),
        ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
      };
      normalizedPrompts.push(entry);
    });

    if (fixedPromptCount > 0) {
      issues.push({
        kind: 'structure',
        field: 'prompts',
        message: `已自動補全／修正 ${fixedPromptCount} 處 Prompt 條目的 identifier、role 或預設注入參數`,
      });
    }
  }

  // Ensure essential SillyTavern chatHistory marker exists so chat messages actually get sent!
  if (!normalizedPrompts.some((p) => p.identifier === 'chatHistory')) {
    const marker = DEFAULT_SYSTEM_MARKERS.find((m) => m.identifier === 'chatHistory')!;
    normalizedPrompts.push({ ...marker });
    issues.push({
      kind: 'structure',
      field: 'prompts.chatHistory',
      message: '缺少核心佔位符 "chatHistory"（缺少它會導致酒館無法送出對話紀錄），已自動補齊',
    });
  }

  chatPreset.prompts = normalizedPrompts;

  // Normalize & synchronize prompt_order
  const validIds = new Set(normalizedPrompts.map((p) => p.identifier));
  let orderItems: PresetPromptOrderItem[] = [];
  let charId = 100001;

  if (!Array.isArray(src.prompt_order) || src.prompt_order.length === 0) {
    issues.push({
      kind: 'structure',
      field: 'prompt_order',
      message: '缺少 prompt_order 排序索引，已依據 prompts 條目順序自動重建',
    });
    orderItems = normalizedPrompts.map((p) => ({
      identifier: p.identifier,
      enabled: p.enabled !== false,
    }));
  } else {
    const firstBlock = src.prompt_order[0] as unknown;
    // Detect flat prompt_order `[{ identifier, enabled }]` instead of `[{ character_id, order: [...] }]`
    if (
      firstBlock &&
      typeof firstBlock === 'object' &&
      'identifier' in (firstBlock as Record<string, unknown>) &&
      !('order' in (firstBlock as Record<string, unknown>))
    ) {
      issues.push({
        kind: 'structure',
        field: 'prompt_order',
        message: '偵測到扁平結構的 prompt_order，已自動包裝為 SillyTavern 標準 { character_id: 100001, order: [...] } 格式',
      });
      orderItems = (src.prompt_order as Record<string, unknown>[])
        .filter((x) => x && typeof x.identifier === 'string')
        .map((x) => ({
          identifier: String(x.identifier),
          enabled: typeof x.enabled === 'boolean' ? x.enabled : true,
        }));
    } else if (
      firstBlock &&
      typeof firstBlock === 'object' &&
      Array.isArray((firstBlock as Record<string, unknown>).order)
    ) {
      const blk = firstBlock as Record<string, unknown>;
      if (typeof blk.character_id === 'number') {
        charId = blk.character_id;
      }
      orderItems = (blk.order as unknown[])
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
        .map((x) => ({
          identifier: typeof x.identifier === 'string' ? x.identifier : '',
          enabled: typeof x.enabled === 'boolean' ? x.enabled : true,
        }))
        .filter((x) => x.identifier.length > 0);
    } else {
      issues.push({
        kind: 'structure',
        field: 'prompt_order',
        message: 'prompt_order 格式損毀，已依據 prompts 列表重新建立排序表',
      });
    }

    // Filter out orphaned IDs and deduplicate
    const seenOrderIds = new Set<string>();
    const cleanedOrder: PresetPromptOrderItem[] = [];
    let orphanedRemoved = 0;

    for (const item of orderItems) {
      if (!validIds.has(item.identifier)) {
        orphanedRemoved++;
        continue;
      }
      if (!seenOrderIds.has(item.identifier)) {
        seenOrderIds.add(item.identifier);
        cleanedOrder.push(item);
      }
    }

    // Append any prompts missing from prompt_order
    let missingAppended = 0;
    for (const p of normalizedPrompts) {
      if (!seenOrderIds.has(p.identifier)) {
        seenOrderIds.add(p.identifier);
        cleanedOrder.push({
          identifier: p.identifier,
          enabled: p.enabled !== false,
        });
        missingAppended++;
      }
    }

    if (orphanedRemoved > 0) {
      issues.push({
        kind: 'structure',
        field: 'prompt_order',
        message: `已移除 ${orphanedRemoved} 筆在 prompts 中不存在的孤立 prompt_order 索引`,
      });
    }
    if (missingAppended > 0) {
      issues.push({
        kind: 'structure',
        field: 'prompt_order',
        message: `已將 ${missingAppended} 筆未列入排序表的 Prompt 自動補入 prompt_order`,
      });
    }
    orderItems = cleanedOrder;
  }

  const orderBlock: PresetPromptOrderBlock = {
    character_id: charId,
    order: orderItems,
  };
  chatPreset.prompt_order = [orderBlock];

  // Ensure prompt.enabled stays synced with prompt_order for UI inspection
  const enabledMap = new Map(orderItems.map((o) => [o.identifier, o.enabled]));
  chatPreset.prompts = chatPreset.prompts.map((p) => ({
    ...p,
    enabled: enabledMap.get(p.identifier) ?? true,
  }));

  const baseName = fileName.replace(/\.[^.]+$/, '');
  return {
    sourceKind,
    presetName:
      typeof src.name === 'string' && src.name.trim() ? src.name.trim() : baseName,
    chatPreset,
    repairIssues: issues,
  };
}

export function chatPresetToTextPreset(chat: SillyTavernChatPreset): SillyTavernTextPreset {
  return {
    temp: chat.temperature,
    temperature_last: true,
    top_p: chat.top_p,
    top_k: chat.top_k,
    top_a: chat.top_a,
    tfs: 1,
    epsilon_cutoff: 0,
    eta_cutoff: 0,
    typical_p: 1,
    min_p: chat.min_p,
    rep_pen: chat.repetition_penalty,
    rep_pen_range: 0,
    rep_pen_decay: 0,
    rep_pen_slope: 1,
    no_repeat_ngram_size: 0,
    penalty_alpha: 0,
    num_beams: 1,
    length_penalty: 1,
    min_length: 0,
    encoder_rep_pen: 1,
    do_sample: true,
    early_stopping: false,
    seed: -1,
    max_length: chat.openai_max_tokens,
    max_context: chat.openai_max_context,
    mirostat_mode: 0,
    mirostat_tau: 5,
    mirostat_eta: 0.1,
  };
}

export function createSampleMalformedPreset(): { fileName: string; bytes: Uint8Array } {
  const brokenPresetText = `\`\`\`json
{
  // 社群分享常見錯誤：含註解、字串化數值、別名欄位、尾隨逗號與缺少 prompt_order 同步
  "temp": "0.85",
  "top_p": "0.92",
  "max_tokens": "2048",
  "context_length": 32768,
  "rep_pen": 1.08,
  "stream": "true",
  "prompts": [
    {
      "name": "主系統提示詞（破格式）",
      "role": "system",
      "content": "你是一位細膩的小說敘事者，請維持第二人稱或第三人稱沉浸描寫。"
    },
    {
      "identifier": "jailbreak_nudge",
      "name": "輸出格式引導",
      "role": "model",
      "content": "每次回覆請包含環境光影與角色微表情描寫。",
      "injection_depth": 2
    },
  ],
  "prompt_order": [
    { "identifier": "non_existent_ghost_id", "enabled": true }
  ],
}
\`\`\``;
  return {
    fileName: 'broken_community_preset.json',
    bytes: new TextEncoder().encode(brokenPresetText),
  };
}
