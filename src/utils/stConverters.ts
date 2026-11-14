import { zipSync, unzipSync } from 'fflate';
import {
  CharacterBook,
  CharacterBookEntry,
  CharacterCardDataV2,
  CharacterCardV1,
  CharacterCardV2,
  CharacterCardV3,
  ChatMessage,
  ChatMetadata,
  ConversionOptions,
  ConversionResult,
  DetectedFormatId,
  ParsedChatLog,
  ParsedTavernFile,
  TargetFormatId,
  TargetFormatOption,
  WorldInfoEntry,
  WorldInfoFile,
} from '../types/sillytavern';
import {
  createFallbackAvatarPng,
  decodeBase64Utf8,
  encodeBase64Utf8,
  isPngBuffer,
  readPngTextChunks,
  writePngTextChunks,
} from './pngChunks';
import {
  chatPresetToTextPreset,
  isLikelyPresetObject,
  parseRelaxedJson,
  repairAndNormalizePreset,
} from './presetRepair';

export const DEFAULT_CONVERSION_OPTIONS: ConversionOptions = {
  prettyJson: true,
  embedBothV2AndV3InPng: true,
  includeSwipes: false,
  excludeSystemMessages: false,
  userNameOverride: '',
  charNameOverride: '',
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjkCount = 0;
  let otherCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjkCount++;
    } else {
      otherCount++;
    }
  }
  return Math.ceil(cjkCount * 1.45 + otherCount / 3.8);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'tavern_export';
}

function ensureString(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : val == null ? fallback : String(val);
}

function ensureStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((item) => ensureString(item)).filter((s) => s.length > 0);
}

function normalizeCharacterBook(raw: unknown): CharacterBook | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const rawEntries = Array.isArray(obj.entries) ? obj.entries : [];
  const entries: CharacterBookEntry[] = rawEntries
    .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
    .map((e, idx) => ({
      id: typeof e.id === 'number' || typeof e.id === 'string' ? e.id : idx,
      keys: ensureStringArray(e.keys ?? e.key),
      secondary_keys: ensureStringArray(e.secondary_keys ?? e.keysecondary),
      comment: ensureString(e.comment ?? e.name),
      content: ensureString(e.content),
      constant: Boolean(e.constant),
      selective: e.selective !== undefined ? Boolean(e.selective) : true,
      insertion_order:
        typeof e.insertion_order === 'number'
          ? e.insertion_order
          : typeof e.order === 'number'
            ? e.order
            : 100,
      enabled: e.enabled !== undefined ? Boolean(e.enabled) : !e.disable,
      position:
        typeof e.position === 'string' || typeof e.position === 'number'
          ? e.position
          : 'before_char',
      priority: typeof e.priority === 'number' ? e.priority : 10,
      case_sensitive: Boolean(e.case_sensitive ?? e.caseSensitive),
      name: ensureString(e.name ?? e.comment),
      extensions:
        e.extensions && typeof e.extensions === 'object'
          ? (e.extensions as Record<string, unknown>)
          : {},
    }));

  return {
    name: ensureString(obj.name),
    description: ensureString(obj.description),
    scan_depth: typeof obj.scan_depth === 'number' ? obj.scan_depth : undefined,
    token_budget: typeof obj.token_budget === 'number' ? obj.token_budget : undefined,
    recursive_scanning:
      typeof obj.recursive_scanning === 'boolean' ? obj.recursive_scanning : undefined,
    extensions:
      obj.extensions && typeof obj.extensions === 'object'
        ? (obj.extensions as Record<string, unknown>)
        : {},
    entries,
  };
}

export function normalizeToV2Data(raw: Record<string, unknown>): {
  data: CharacterCardDataV2;
  version: 'v1' | 'v2' | 'v3';
} {
  const isV3 = raw.spec === 'chara_card_v3' && raw.data && typeof raw.data === 'object';
  const isV2 = raw.spec === 'chara_card_v2' && raw.data && typeof raw.data === 'object';
  const src = (isV3 || isV2 ? raw.data : raw) as Record<string, unknown>;

  const knownV1Keys = new Set([
    'name',
    'description',
    'personality',
    'scenario',
    'first_mes',
    'mes_example',
  ]);

  const extensions: Record<string, unknown> =
    src.extensions && typeof src.extensions === 'object'
      ? { ...(src.extensions as Record<string, unknown>) }
      : {};

  if (!isV2 && !isV3) {
    for (const [k, v] of Object.entries(src)) {
      if (!knownV1Keys.has(k) && v !== undefined) {
        extensions[k] = v;
      }
    }
  }

  const data: CharacterCardDataV2 = {
    name: ensureString(src.name, '未命名角色'),
    description: ensureString(src.description),
    personality: ensureString(src.personality),
    scenario: ensureString(src.scenario),
    first_mes: ensureString(src.first_mes),
    mes_example: ensureString(src.mes_example),
    creator_notes: ensureString(src.creator_notes),
    system_prompt: ensureString(src.system_prompt),
    post_history_instructions: ensureString(src.post_history_instructions),
    alternate_greetings: ensureStringArray(src.alternate_greetings),
    character_book: normalizeCharacterBook(src.character_book),
    tags: ensureStringArray(src.tags),
    creator: ensureString(src.creator),
    character_version: ensureString(src.character_version, '1.0'),
    extensions,
  };

  if (Array.isArray(src.group_only_greetings)) {
    data.group_only_greetings = ensureStringArray(src.group_only_greetings);
  }
  if (typeof src.nickname === 'string' && src.nickname.length > 0) {
    data.nickname = src.nickname;
  }
  if (Array.isArray(src.source)) {
    data.source = ensureStringArray(src.source);
  }
  if (typeof src.creation_date === 'number') {
    data.creation_date = src.creation_date;
  }
  if (typeof src.modification_date === 'number') {
    data.modification_date = src.modification_date;
  }
  if (Array.isArray(src.assets)) {
    data.assets = src.assets as CharacterCardDataV2['assets'];
  }

  return {
    data,
    version: isV3 ? 'v3' : isV2 ? 'v2' : 'v1',
  };
}

function createDefaultWorldInfoEntry(uid: number): WorldInfoEntry {
  return {
    uid,
    key: [],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    vectorized: false,
    selective: true,
    selectiveLogic: 0,
    addMemo: true,
    order: 100,
    position: 0,
    disable: false,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    probability: 100,
    useProbability: true,
    depth: 4,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: null,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    displayIndex: uid,
  };
}

export function charBookPositionToStNumber(pos: string | number | undefined): number {
  if (typeof pos === 'number') return pos;
  switch (pos) {
    case 'before_char':
      return 0;
    case 'after_char':
      return 1;
    case 'before_an':
      return 2;
    case 'after_an':
      return 3;
    case 'at_depth':
      return 4;
    default:
      return 0;
  }
}

export function stPositionToCharBookString(pos: number): string {
  switch (pos) {
    case 0:
      return 'before_char';
    case 1:
      return 'after_char';
    case 2:
      return 'before_an';
    case 3:
      return 'after_an';
    case 4:
      return 'at_depth';
    default:
      return 'before_char';
  }
}

export function characterBookToWorldInfo(book: CharacterBook): WorldInfoFile {
  const entries: Record<string, WorldInfoEntry> = {};
  book.entries.forEach((entry, idx) => {
    const uid = typeof entry.id === 'number' ? entry.id : idx;
    const ext = (entry.extensions ?? {}) as Record<string, unknown>;
    const base = createDefaultWorldInfoEntry(uid);
    entries[String(uid)] = {
      ...base,
      uid,
      key: [...entry.keys],
      keysecondary: [...(entry.secondary_keys ?? [])],
      comment: entry.comment || entry.name || `條目 ${idx + 1}`,
      content: entry.content,
      constant: Boolean(entry.constant),
      selective: entry.selective !== undefined ? Boolean(entry.selective) : true,
      selectiveLogic: typeof ext.selectiveLogic === 'number' ? ext.selectiveLogic : 0,
      order: entry.insertion_order ?? 100,
      position:
        typeof ext.position === 'number'
          ? ext.position
          : charBookPositionToStNumber(entry.position),
      disable: entry.enabled === false,
      excludeRecursion: Boolean(ext.exclude_recursion),
      preventRecursion: Boolean(ext.prevent_recursion),
      delayUntilRecursion: Boolean(ext.delay_until_recursion),
      probability: typeof ext.probability === 'number' ? ext.probability : 100,
      useProbability: ext.useProbability !== undefined ? Boolean(ext.useProbability) : true,
      depth: typeof ext.depth === 'number' ? ext.depth : 4,
      group: ensureString(ext.group),
      scanDepth: typeof ext.scan_depth === 'number' ? ext.scan_depth : null,
      caseSensitive:
        typeof entry.case_sensitive === 'boolean' ? entry.case_sensitive : null,
      matchWholeWords:
        typeof ext.match_whole_words === 'boolean' ? ext.match_whole_words : null,
      role: typeof ext.role === 'number' ? ext.role : null,
      sticky: typeof ext.sticky === 'number' ? ext.sticky : 0,
      cooldown: typeof ext.cooldown === 'number' ? ext.cooldown : 0,
      delay: typeof ext.delay === 'number' ? ext.delay : 0,
      displayIndex: idx,
    };
  });

  return {
    entries,
    originalName: book.name,
  };
}

export function worldInfoToCharacterBook(wi: WorldInfoFile, name = 'World Info'): CharacterBook {
  const sorted = Object.values(wi.entries).sort((a, b) => a.uid - b.uid);
  const entries: CharacterBookEntry[] = sorted.map((entry) => ({
    id: entry.uid,
    keys: [...entry.key],
    secondary_keys: [...entry.keysecondary],
    comment: entry.comment,
    content: entry.content,
    constant: entry.constant,
    selective: entry.selective,
    insertion_order: entry.order,
    enabled: !entry.disable,
    position: stPositionToCharBookString(entry.position),
    priority: 10,
    case_sensitive: Boolean(entry.caseSensitive),
    name: entry.comment,
    extensions: {
      position: entry.position,
      exclude_recursion: entry.excludeRecursion,
      prevent_recursion: entry.preventRecursion,
      delay_until_recursion: entry.delayUntilRecursion,
      probability: entry.probability,
      useProbability: entry.useProbability,
      depth: entry.depth,
      selectiveLogic: entry.selectiveLogic,
      group: entry.group,
      scan_depth: entry.scanDepth,
      match_whole_words: entry.matchWholeWords,
      role: entry.role,
      sticky: entry.sticky,
      cooldown: entry.cooldown,
      delay: entry.delay,
    },
  }));

  return {
    name: wi.originalName || name,
    entries,
  };
}

function normalizeWorldInfoObject(raw: Record<string, unknown>): WorldInfoFile {
  const rawEntries = raw.entries as Record<string, unknown>;
  const entries: Record<string, WorldInfoEntry> = {};

  Object.entries(rawEntries).forEach(([mapKey, val], idx) => {
    if (!val || typeof val !== 'object') return;
    const item = val as Record<string, unknown>;
    const uid = typeof item.uid === 'number' ? item.uid : Number(mapKey) || idx;
    const base = createDefaultWorldInfoEntry(uid);
    entries[String(uid)] = {
      ...base,
      uid,
      key: ensureStringArray(item.key),
      keysecondary: ensureStringArray(item.keysecondary),
      comment: ensureString(item.comment),
      content: ensureString(item.content),
      constant: Boolean(item.constant),
      vectorized: Boolean(item.vectorized),
      selective: item.selective !== undefined ? Boolean(item.selective) : true,
      selectiveLogic: typeof item.selectiveLogic === 'number' ? item.selectiveLogic : 0,
      addMemo: item.addMemo !== undefined ? Boolean(item.addMemo) : true,
      order: typeof item.order === 'number' ? item.order : 100,
      position: typeof item.position === 'number' ? item.position : 0,
      disable: Boolean(item.disable),
      excludeRecursion: Boolean(item.excludeRecursion),
      preventRecursion: Boolean(item.preventRecursion),
      delayUntilRecursion: Boolean(item.delayUntilRecursion),
      probability: typeof item.probability === 'number' ? item.probability : 100,
      useProbability: item.useProbability !== undefined ? Boolean(item.useProbability) : true,
      depth: typeof item.depth === 'number' ? item.depth : 4,
      group: ensureString(item.group),
      groupOverride: Boolean(item.groupOverride),
      groupWeight: typeof item.groupWeight === 'number' ? item.groupWeight : 100,
      scanDepth: typeof item.scanDepth === 'number' ? item.scanDepth : null,
      caseSensitive: typeof item.caseSensitive === 'boolean' ? item.caseSensitive : null,
      matchWholeWords:
        typeof item.matchWholeWords === 'boolean' ? item.matchWholeWords : null,
      useGroupScoring:
        typeof item.useGroupScoring === 'boolean' ? item.useGroupScoring : null,
      automationId: ensureString(item.automationId),
      role: typeof item.role === 'number' ? item.role : null,
      sticky: typeof item.sticky === 'number' ? item.sticky : 0,
      cooldown: typeof item.cooldown === 'number' ? item.cooldown : 0,
      delay: typeof item.delay === 'number' ? item.delay : 0,
      displayIndex: typeof item.displayIndex === 'number' ? item.displayIndex : idx,
    };
  });

  return {
    entries,
    originalName: typeof raw.name === 'string' ? raw.name : undefined,
  };
}

// RFC-4180 compliant CSV parser
export function parseCsvRows(csvText: string): string[][] {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function worldInfoToCsv(wi: WorldInfoFile): string {
  const header = [
    'uid',
    'comment',
    'keys',
    'secondary_keys',
    'content',
    'order',
    'position',
    'depth',
    'constant',
    'enabled',
    'probability',
    'group',
  ];
  const lines = [header.join(',')];
  const entries = Object.values(wi.entries).sort((a, b) => a.order - b.order || a.uid - b.uid);

  for (const e of entries) {
    lines.push(
      [
        String(e.uid),
        escapeCsvCell(e.comment),
        escapeCsvCell(e.key.join('; ')),
        escapeCsvCell(e.keysecondary.join('; ')),
        escapeCsvCell(e.content),
        String(e.order),
        String(e.position),
        String(e.depth),
        e.constant ? 'true' : 'false',
        e.disable ? 'false' : 'true',
        String(e.probability),
        escapeCsvCell(e.group),
      ].join(','),
    );
  }

  return `\uFEFF${lines.join('\n')}`;
}

export function csvToWorldInfo(csvText: string): WorldInfoFile {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error('CSV 檔案至少需要標題列與一筆資料列');
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idxOf = (names: string[]) => headers.findIndex((h) => names.includes(h));

  const contentIdx = idxOf(['content', '內容', 'text']);
  const keysIdx = idxOf(['keys', 'key', '關鍵字']);
  if (contentIdx === -1 && keysIdx === -1) {
    throw new Error('CSV 找不到世界書必要欄位（需包含 content 或 keys 欄）');
  }

  const uidIdx = idxOf(['uid', 'id']);
  const commentIdx = idxOf(['comment', 'title', 'name', '備註', '名稱']);
  const secKeysIdx = idxOf(['secondary_keys', 'keysecondary', '次要關鍵字']);
  const orderIdx = idxOf(['order', 'insertion_order', '順序']);
  const posIdx = idxOf(['position', '位置']);
  const depthIdx = idxOf(['depth', '深度']);
  const constIdx = idxOf(['constant', '常駐']);
  const enabledIdx = idxOf(['enabled', '啟用']);
  const probIdx = idxOf(['probability', '機率']);
  const groupIdx = idxOf(['group', '群組']);

  const entries: Record<string, WorldInfoEntry> = {};
  rows.slice(1).forEach((row, i) => {
    const parseNum = (raw: string | undefined, fallback: number) => {
      if (raw === undefined || raw.trim() === '') return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };
    const uid = uidIdx >= 0 ? parseNum(row[uidIdx], i) : i;
    const base = createDefaultWorldInfoEntry(uid);
    const splitKeys = (raw: string | undefined) =>
      raw
        ? raw
            .split(/[;｜|]/)
            .map((k) => k.trim())
            .filter(Boolean)
        : [];
    const parseBool = (raw: string | undefined, fallback: boolean) => {
      if (!raw) return fallback;
      const lower = raw.trim().toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes' || lower === '是') return true;
      if (lower === 'false' || lower === '0' || lower === 'no' || lower === '否') return false;
      return fallback;
    };

    entries[String(uid)] = {
      ...base,
      uid,
      comment: commentIdx >= 0 ? ensureString(row[commentIdx]) : `條目 ${i + 1}`,
      key: keysIdx >= 0 ? splitKeys(row[keysIdx]) : [],
      keysecondary: secKeysIdx >= 0 ? splitKeys(row[secKeysIdx]) : [],
      content: contentIdx >= 0 ? ensureString(row[contentIdx]) : '',
      order: orderIdx >= 0 ? parseNum(row[orderIdx], 100) : 100,
      position: posIdx >= 0 ? parseNum(row[posIdx], 0) : 0,
      depth: depthIdx >= 0 ? parseNum(row[depthIdx], 4) : 4,
      constant: constIdx >= 0 ? parseBool(row[constIdx], false) : false,
      disable: enabledIdx >= 0 ? !parseBool(row[enabledIdx], true) : false,
      probability: probIdx >= 0 ? parseNum(row[probIdx], 100) : 100,
      group: groupIdx >= 0 ? ensureString(row[groupIdx]) : '',
    };
  });

  return { entries };
}

function parseChatTxt(txt: string): ParsedChatLog {
  const lines = txt.replace(/\r\n/g, '\n').split('\n');
  const messages: ChatMessage[] = [];
  const headerPattern = /^(?:\[([^\]]+)\]\s*)?([^:\n]{1,40}):\s*(.*)$/;

  let current: ChatMessage | null = null;
  for (const line of lines) {
    const match = line.match(headerPattern);
    if (match && !line.startsWith('http')) {
      if (current) {
        current.mes = current.mes.trimEnd();
        messages.push(current);
      }
      const sendDate = match[1] ? match[1].trim() : '';
      const speaker = match[2].trim();
      const firstBody = match[3] ?? '';
      const lower = speaker.toLowerCase();
      const isUser = lower === 'user' || lower === 'you' || speaker === '你' || speaker === '使用者';
      const isSystem = lower === 'system' || speaker === '系統';

      current = {
        name: speaker,
        is_user: isUser,
        is_system: isSystem,
        send_date: sendDate || undefined,
        mes: firstBody,
      };
    } else if (current) {
      current.mes += (current.mes ? '\n' : '') + line;
    }
  }
  if (current) {
    current.mes = current.mes.trimEnd();
    messages.push(current);
  }

  if (messages.length === 0) {
    throw new Error('純文字檔案無法辨識對話結構（預期格式為「角色名: 對話內容」）');
  }

  const firstUser = messages.find((m) => m.is_user)?.name || 'User';
  const firstChar = messages.find((m) => !m.is_user && !m.is_system)?.name || 'Character';

  return {
    metadata: {
      user_name: firstUser,
      character_name: firstChar,
      create_date: new Date().toISOString(),
    },
    messages,
  };
}

function summarizeCharacter(data: CharacterCardDataV2, chunks?: string[]) {
  const combinedText = [
    data.description,
    data.personality,
    data.scenario,
    data.first_mes,
    data.mes_example,
    data.system_prompt,
    data.post_history_instructions,
    ...data.alternate_greetings,
    ...(data.character_book?.entries.map((e) => e.content) ?? []),
  ].join('\n');

  const loreCount = data.character_book?.entries.length ?? 0;
  return {
    title: data.name || '未命名角色',
    subtitle: data.creator ? `作者：${data.creator}` : '角色卡設定',
    estimatedTokens: estimateTokens(combinedText),
    itemCount: 1 + data.alternate_greetings.length,
    itemLabel: `開場白 ${1 + data.alternate_greetings.length} 則`,
    hasEmbeddedWorldInfo: loreCount > 0,
    embeddedWorldInfoCount: loreCount,
    pngChunksFound: chunks,
  };
}

export function parseTavernFile(fileName: string, bytes: Uint8Array): ParsedTavernFile {
  const id = `${fileName}_${bytes.length}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const lowerName = fileName.toLowerCase();

  // 1. PNG Character Card
  if (isPngBuffer(bytes) || lowerName.endsWith('.png')) {
    if (!isPngBuffer(bytes)) {
      throw new Error('副檔名為 .png，但檔案標頭不是有效的 PNG 圖片格式');
    }
    const textChunks = readPngTextChunks(bytes);
    const chunkKeys = Object.keys(textChunks);
    const rawBase64 = textChunks.ccv3 || textChunks.chara;
    if (!rawBase64) {
      throw new Error('此 PNG 圖片未包含 SillyTavern 角色卡資料（找不到 chara 或 ccv3 區塊）');
    }

    let parsedJson: Record<string, unknown>;
    try {
      const jsonText = decodeBase64Utf8(rawBase64);
      parsedJson = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      throw new Error('PNG 內的 chara/ccv3 Base64 資料損毀或不是合法的 JSON');
    }

    const { data, version } = normalizeToV2Data(parsedJson);
    const detectedFormat: DetectedFormatId =
      version === 'v3' ? 'char_png_v3' : version === 'v2' ? 'char_png_v2' : 'char_png_v1';
    const detectedFormatLabel =
      version === 'v3'
        ? '角色卡 PNG (V3)'
        : version === 'v2'
          ? '角色卡 PNG (V2)'
          : '角色卡 PNG (V1 舊版)';

    return {
      id,
      fileName,
      fileSize: bytes.length,
      category: 'character',
      detectedFormat,
      detectedFormatLabel,
      summary: summarizeCharacter(data, chunkKeys),
      avatarPngBytes: bytes,
      characterData: data,
    };
  }

  // 2. CHARX (ZIP archive)
  if (lowerName.endsWith('.charx')) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new Error('無法解壓縮 .charx 檔案，ZIP 結構可能已損毀');
    }

    const cardJsonBytes = files['card.json'];
    if (!cardJsonBytes) {
      throw new Error('.charx 封裝中找不到 card.json');
    }

    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(new TextDecoder('utf-8').decode(cardJsonBytes)) as Record<
        string,
        unknown
      >;
    } catch {
      throw new Error('.charx 內的 card.json 格式無效');
    }

    const { data } = normalizeToV2Data(parsedJson);
    let avatarPngBytes: Uint8Array | undefined;
    for (const [path, content] of Object.entries(files)) {
      if (path.toLowerCase().endsWith('.png') && isPngBuffer(content)) {
        avatarPngBytes = content;
        break;
      }
    }

    return {
      id,
      fileName,
      fileSize: bytes.length,
      category: 'character',
      detectedFormat: 'charx_v3',
      detectedFormatLabel: 'CHARX 角色封裝 (V3)',
      summary: summarizeCharacter(data, Object.keys(files)),
      avatarPngBytes,
      characterData: data,
    };
  }

  const text = new TextDecoder('utf-8').decode(bytes).trim();

  // 3. CSV World Info
  if (lowerName.endsWith('.csv')) {
    const wi = csvToWorldInfo(text);
    const entriesArr = Object.values(wi.entries);
    const totalTokens = estimateTokens(entriesArr.map((e) => e.content).join('\n'));
    return {
      id,
      fileName,
      fileSize: bytes.length,
      category: 'world_info',
      detectedFormat: 'world_info_csv',
      detectedFormatLabel: '世界書 CSV 表格',
      summary: {
        title: stripExtension(fileName),
        subtitle: 'CSV 匯入世界書',
        estimatedTokens: totalTokens,
        itemCount: entriesArr.length,
        itemLabel: `${entriesArr.length} 筆條目`,
      },
      worldInfo: wi,
    };
  }

  // 4. JSONL Chat Log
  if (lowerName.endsWith('.jsonl')) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      throw new Error('.jsonl 檔案是空的');
    }
    const parsedObjects = lines.map((line, i) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new Error(`.jsonl 第 ${i + 1} 行 JSON 語法錯誤`);
      }
    });

    let metadata: ChatMetadata = {};
    let msgObjects = parsedObjects;
    const first = parsedObjects[0];
    if (first && typeof first.mes !== 'string' && (first.user_name || first.character_name || first.chat_metadata)) {
      metadata = first as ChatMetadata;
      msgObjects = parsedObjects.slice(1);
    }

    const messages: ChatMessage[] = msgObjects.map((m) => ({
      ...m,
      name: ensureString(m.name, m.is_user ? metadata.user_name || 'User' : metadata.character_name || 'Char'),
      is_user: Boolean(m.is_user),
      is_system: Boolean(m.is_system),
      send_date: typeof m.send_date === 'string' ? m.send_date : undefined,
      mes: ensureString(m.mes),
      swipes: Array.isArray(m.swipes) ? m.swipes.map((s) => ensureString(s)) : undefined,
      swipe_id: typeof m.swipe_id === 'number' ? m.swipe_id : undefined,
    }));

    const totalTokens = estimateTokens(messages.map((m) => m.mes).join('\n'));
    return {
      id,
      fileName,
      fileSize: bytes.length,
      category: 'chat',
      detectedFormat: 'chat_jsonl',
      detectedFormatLabel: 'SillyTavern 聊天紀錄 (.jsonl)',
      summary: {
        title: metadata.character_name || stripExtension(fileName),
        subtitle: `對話對象：${metadata.user_name || 'User'}`,
        estimatedTokens: totalTokens,
        itemCount: messages.length,
        itemLabel: `${messages.length} 則訊息`,
      },
      chatLog: { metadata, messages },
    };
  }

  // 5. JSON & Relaxed JSON (Character Card, World Info, Character Book, Preset, or Legacy Chat Array)
  const looksLikeJsonOrFence =
    text.startsWith('{') ||
    text.startsWith('[') ||
    /^```(?:json|jsonc|json5)?\s*\r?\n/i.test(text);

  if (
    lowerName.endsWith('.json') ||
    (!lowerName.endsWith('.txt') && !lowerName.endsWith('.md') && looksLikeJsonOrFence) ||
    (lowerName.endsWith('.txt') && /^```(?:json|jsonc|json5)?\s*\r?\n/i.test(text))
  ) {
    let parsed: unknown;
    let syntaxFixes: string[] = [];
    try {
      const relaxed = parseRelaxedJson(text);
      parsed = relaxed.parsed;
      syntaxFixes = relaxed.syntaxFixes;
    } catch {
      // Could be JSONL saved with .txt or .json extension? Check multi-line JSON
      const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
      if (lines.length > 1) {
        return parseTavernFile(`${stripExtension(fileName)}.jsonl`, bytes);
      }
      throw new Error('無法解析 JSON 檔案：語法損毀且無法自動修復');
    }

    // Legacy chat array OR standalone prompts array
    if (Array.isArray(parsed)) {
      const firstObj = parsed.find(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
      );
      if (
        firstObj &&
        !('mes' in firstObj) &&
        ('role' in firstObj || 'system_prompt' in firstObj || 'identifier' in firstObj)
      ) {
        const presetData = repairAndNormalizePreset(parsed, fileName, syntaxFixes);
        const promptText = presetData.chatPreset.prompts.map((p) => p.content).join('\n');
        return {
          id,
          fileName,
          fileSize: bytes.length,
          category: 'preset',
          detectedFormat: 'preset_repaired',
          detectedFormatLabel: `酒館預設（已自動修復 ${presetData.repairIssues.length} 項）`,
          summary: {
            title: presetData.presetName,
            subtitle: 'Prompt 陣列片段修復為 Chat Completion 預設',
            estimatedTokens: estimateTokens(promptText),
            itemCount: presetData.chatPreset.prompts.length,
            itemLabel: `${presetData.chatPreset.prompts.length} 段提示詞`,
            repairCount: presetData.repairIssues.length,
          },
          presetData,
        };
      }

      const messages: ChatMessage[] = parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((m) => ({
          ...m,
          name: ensureString(m.name, m.is_user ? 'User' : 'Character'),
          is_user: Boolean(m.is_user),
          is_system: Boolean(m.is_system),
          send_date: typeof m.send_date === 'string' ? m.send_date : undefined,
          mes: ensureString(m.mes ?? m.message ?? m.content),
        }));
      if (messages.length === 0) {
        throw new Error('JSON 陣列內找不到對話訊息或 Prompt 欄位');
      }
      return {
        id,
        fileName,
        fileSize: bytes.length,
        category: 'chat',
        detectedFormat: 'chat_json',
        detectedFormatLabel: '聊天紀錄 JSON 陣列',
        summary: {
          title: stripExtension(fileName),
          subtitle: '舊版陣列格式',
          estimatedTokens: estimateTokens(messages.map((m) => m.mes).join('\n')),
          itemCount: messages.length,
          itemLabel: `${messages.length} 則訊息`,
        },
        chatLog: {
          metadata: {
            user_name: messages.find((m) => m.is_user)?.name || 'User',
            character_name: messages.find((m) => !m.is_user)?.name || 'Character',
          },
          messages,
        },
      };
    }

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;

      // Character Card V2 / V3
      if (obj.spec === 'chara_card_v3' || obj.spec === 'chara_card_v2') {
        const { data, version } = normalizeToV2Data(obj);
        return {
          id,
          fileName,
          fileSize: bytes.length,
          category: 'character',
          detectedFormat: version === 'v3' ? 'char_json_v3' : 'char_json_v2',
          detectedFormatLabel: version === 'v3' ? '角色卡 JSON (V3)' : '角色卡 JSON (V2)',
          summary: summarizeCharacter(data),
          characterData: data,
        };
      }

      // World Info (SillyTavern entries map or Character Book entries array)
      if (obj.entries && typeof obj.entries === 'object') {
        if (Array.isArray(obj.entries)) {
          const book = normalizeCharacterBook(obj)!;
          const wi = characterBookToWorldInfo(book);
          const entriesArr = Object.values(wi.entries);
          return {
            id,
            fileName,
            fileSize: bytes.length,
            category: 'world_info',
            detectedFormat: 'world_info_charbook',
            detectedFormatLabel: 'Character Book 世界書 (陣列)',
            summary: {
              title: book.name || stripExtension(fileName),
              subtitle: 'CCv2/V3 內嵌標準結構',
              estimatedTokens: estimateTokens(entriesArr.map((e) => e.content).join('\n')),
              itemCount: entriesArr.length,
              itemLabel: `${entriesArr.length} 筆條目`,
            },
            worldInfo: wi,
          };
        } else {
          const wi = normalizeWorldInfoObject(obj);
          const entriesArr = Object.values(wi.entries);
          return {
            id,
            fileName,
            fileSize: bytes.length,
            category: 'world_info',
            detectedFormat: 'world_info_st',
            detectedFormatLabel: 'SillyTavern 世界書 (Object Map)',
            summary: {
              title: wi.originalName || stripExtension(fileName),
              subtitle: '酒館獨立世界書格式',
              estimatedTokens: estimateTokens(entriesArr.map((e) => e.content).join('\n')),
              itemCount: entriesArr.length,
              itemLabel: `${entriesArr.length} 筆條目`,
            },
            worldInfo: wi,
          };
        }
      }

      // Character Card V1 (flat JSON with name + first_mes or description)
      if (typeof obj.name === 'string' && (typeof obj.first_mes === 'string' || typeof obj.description === 'string')) {
        const { data } = normalizeToV2Data(obj);
        return {
          id,
          fileName,
          fileSize: bytes.length,
          category: 'character',
          detectedFormat: 'char_json_v1',
          detectedFormatLabel: '角色卡 JSON (V1 舊版)',
          summary: summarizeCharacter(data),
          characterData: data,
        };
      }

      // Chat JSON with { messages: [...] }
      if (Array.isArray(obj.messages)) {
        const messages = (obj.messages as Record<string, unknown>[]).map((m) => ({
          ...m,
          name: ensureString(m.name, m.is_user ? 'User' : 'Character'),
          is_user: Boolean(m.is_user),
          is_system: Boolean(m.is_system),
          mes: ensureString(m.mes ?? m.content),
        }));
        return {
          id,
          fileName,
          fileSize: bytes.length,
          category: 'chat',
          detectedFormat: 'chat_json',
          detectedFormatLabel: '聊天紀錄 JSON',
          summary: {
            title: stripExtension(fileName),
            subtitle: '對話紀錄物件',
            estimatedTokens: estimateTokens(messages.map((m) => m.mes).join('\n')),
            itemCount: messages.length,
            itemLabel: `${messages.length} 則訊息`,
          },
          chatLog: {
            metadata: {
              user_name: ensureString(obj.user_name, 'User'),
              character_name: ensureString(obj.character_name, 'Character'),
            },
            messages,
          },
        };
      }
      // SillyTavern Preset (Chat Completion, Text Completion, or Malformed Preset)
      if (isLikelyPresetObject(obj) || typeof obj.system_prompt === 'string') {
        const presetData = repairAndNormalizePreset(obj, fileName, syntaxFixes);
        const promptText = presetData.chatPreset.prompts.map((p) => p.content).join('\n');
        const repairCount = presetData.repairIssues.length;
        const detectedFormat: DetectedFormatId =
          repairCount > 0
            ? 'preset_repaired'
            : presetData.sourceKind === 'text_completion'
              ? 'preset_text'
              : 'preset_chat';
        const detectedFormatLabel =
          repairCount > 0
            ? `酒館預設（已自動修復 ${repairCount} 項）`
            : presetData.sourceKind === 'text_completion'
              ? 'Text Completion 預設'
              : 'Chat Completion 預設';

        return {
          id,
          fileName,
          fileSize: bytes.length,
          category: 'preset',
          detectedFormat,
          detectedFormatLabel,
          summary: {
            title: presetData.presetName,
            subtitle:
              repairCount > 0
                ? `已自動修正 ${repairCount} 處語法或結構問題`
                : 'SillyTavern 標準預設結構',
            estimatedTokens: estimateTokens(promptText),
            itemCount: presetData.chatPreset.prompts.length,
            itemLabel: `${presetData.chatPreset.prompts.length} 段提示詞`,
            repairCount,
          },
          presetData,
        };
      }
    }

    throw new Error('無法辨識此 JSON 為角色卡、世界書、預設或聊天紀錄格式');
  }

  // 6. Plain Text Chat Log
  if (lowerName.endsWith('.txt')) {
    const chatLog = parseChatTxt(text);
    return {
      id,
      fileName,
      fileSize: bytes.length,
      category: 'chat',
      detectedFormat: 'chat_txt',
      detectedFormatLabel: '純文字對話紀錄 (.txt)',
      summary: {
        title: chatLog.metadata.character_name || stripExtension(fileName),
        subtitle: '純文字劇本匯入',
        estimatedTokens: estimateTokens(chatLog.messages.map((m) => m.mes).join('\n')),
        itemCount: chatLog.messages.length,
        itemLabel: `${chatLog.messages.length} 則訊息`,
      },
      chatLog,
    };
  }

  throw new Error(`不支援的檔案類型：${fileName}（支援 .png, .charx, .json, .jsonl, .csv, .txt）`);
}

export function getAvailableTargets(parsed: ParsedTavernFile): TargetFormatOption[] {
  if (parsed.category === 'character') {
    const targets: TargetFormatOption[] = [
      {
        id: 'char_png_v3',
        label: '角色卡 PNG (V3 標準)',
        shortLabel: 'PNG V3',
        extension: '.png',
        description: '將角色資料嵌入 PNG 圖片（寫入 ccv3 與相容 chara 區塊）。',
      },
      {
        id: 'char_png_v2',
        label: '角色卡 PNG (V2 相容)',
        shortLabel: 'PNG V2',
        extension: '.png',
        description: '標準 V2 PNG 角色卡，相容所有主流版本酒館。',
      },
      {
        id: 'char_json_v3',
        label: '角色卡 JSON (V3)',
        shortLabel: 'JSON V3',
        extension: '.json',
        description: '最新 Chara Card V3 純文字 JSON 格式。',
      },
      {
        id: 'char_json_v2',
        label: '角色卡 JSON (V2)',
        shortLabel: 'JSON V2',
        extension: '.json',
        description: '通用 Chara Card V2 JSON 格式，便於編輯與備份。',
      },
      {
        id: 'charx_v3',
        label: 'CHARX 封裝 (.charx)',
        shortLabel: 'CHARX',
        extension: '.charx',
        description: 'RisuAI / SillyTavern V3 壓縮封裝，內含 card.json 與頭像資源。',
      },
      {
        id: 'char_json_v1',
        label: '角色卡 JSON (V1 舊版)',
        shortLabel: 'JSON V1',
        extension: '.json',
        description: '舊版扁平結構 JSON（不包含備用開場白與進階系統提示詞）。',
      },
      {
        id: 'char_md',
        label: '角色設定書 (.md)',
        shortLabel: 'Markdown',
        extension: '.md',
        description: '排版整齊的 Markdown 角色檔案，適合閱讀與保存。',
      },
    ];

    if (parsed.characterData?.character_book?.entries.length) {
      targets.push({
        id: 'world_info_st',
        label: '提取內嵌世界書 (.json)',
        shortLabel: '提取世界書',
        extension: '_worldinfo.json',
        description: '將角色卡內嵌的 character_book 提取為獨立 SillyTavern 世界書。',
      });
    }
    return targets;
  }

  if (parsed.category === 'world_info') {
    return [
      {
        id: 'world_info_st',
        label: 'SillyTavern 世界書 (.json)',
        shortLabel: 'ST 世界書',
        extension: '.json',
        description: '酒館標準 Object Map 結構，可直接匯入 World Info 面板。',
      },
      {
        id: 'world_info_charbook',
        label: 'Character Book (.json)',
        shortLabel: 'CharBook 陣列',
        extension: '_charbook.json',
        description: 'CCv2/V3 角色卡內嵌用陣列格式。',
      },
      {
        id: 'world_info_csv',
        label: 'CSV 試算表 (.csv)',
        shortLabel: 'CSV 表格',
        extension: '.csv',
        description: '含 UTF-8 BOM，可用 Excel / Google Sheets 批次編輯後轉回。',
      },
      {
        id: 'world_info_md',
        label: '世界書設定集 (.md)',
        shortLabel: 'Markdown',
        extension: '.md',
        description: '轉換為方便查閱的 Markdown 條目清單。',
      },
    ];
  }

  if (parsed.category === 'preset') {
    return [
      {
        id: 'preset_chat',
        label: 'Chat Completion 預設 (.json)',
        shortLabel: 'Chat Preset',
        extension: '.json',
        description: 'OpenAI / Claude / Gemini 通用酒館標準預設（含修復後的 prompts 與 prompt_order）。',
      },
      {
        id: 'preset_text',
        label: 'Text Completion 預設 (.json)',
        shortLabel: 'Text Preset',
        extension: '.json',
        description: '轉換為 KoboldAI / TextGen / Ooba 文本補全取樣參數格式。',
      },
      {
        id: 'preset_md',
        label: '預設提示詞與參數整理 (.md)',
        shortLabel: 'Markdown',
        extension: '.md',
        description: '將預設內的採樣參數與系統提示詞依序整理為 Markdown 文件。',
      },
    ];
  }

  return [
    {
      id: 'chat_jsonl',
      label: 'SillyTavern 聊天紀錄 (.jsonl)',
      shortLabel: 'JSONL',
      extension: '.jsonl',
      description: '酒館原生 JSON Lines 對話紀錄，可直接放回 chats 資料夾。',
    },
    {
      id: 'chat_md',
      label: '小說式 Markdown (.md)',
      shortLabel: 'Markdown',
      extension: '.md',
      description: '適合閱讀、整理或發布的純淨對話紀錄。',
    },
    {
      id: 'chat_txt',
      label: '純文字劇本 (.txt)',
      shortLabel: 'TXT',
      extension: '.txt',
      description: '通用純文字對話紀錄，支援再次轉回 .jsonl。',
    },
    {
      id: 'chat_html',
      label: '獨立閱讀網頁 (.html)',
      shortLabel: 'HTML',
      extension: '.html',
      description: '單檔離線網頁，可直接在任何瀏覽器以排版模式閱讀。',
    },
    {
      id: 'chat_json',
      label: 'JSON 陣列 (.json)',
      shortLabel: 'JSON 陣列',
      extension: '.json',
      description: '傳統 JSON 陣列格式，方便程式二次處理。',
    },
  ];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function convertTavernFile(
  parsed: ParsedTavernFile,
  target: TargetFormatId,
  options: ConversionOptions = DEFAULT_CONVERSION_OPTIONS,
  customAvatarPng?: Uint8Array,
): ConversionResult {
  const baseName = sanitizeFileName(stripExtension(parsed.fileName));
  const indent = options.prettyJson ? 2 : 0;
  const warnings: string[] = [];
  const encoder = new TextEncoder();

  // ---------------- CHARACTER CARD ----------------
  if (parsed.category === 'character' && parsed.characterData) {
    const data = parsed.characterData;
    const cardBaseName = sanitizeFileName(data.name || baseName);

    if (target === 'world_info_st') {
      if (!data.character_book || data.character_book.entries.length === 0) {
        throw new Error('此角色卡沒有內嵌世界書資料');
      }
      const wi = characterBookToWorldInfo(data.character_book);
      const jsonStr = JSON.stringify({ entries: wi.entries }, null, indent);
      const bytes = encoder.encode(jsonStr);
      return {
        fileName: `${cardBaseName}_worldinfo.json`,
        mimeType: 'application/json',
        bytes,
        textPreview: jsonStr,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'char_json_v1') {
      if (data.alternate_greetings.length > 0 || data.character_book?.entries.length || data.system_prompt) {
        warnings.push('V1 舊版格式不支援備用開場白、內嵌世界書與系統提示詞，這些進階欄位將不會寫入 V1 輸出。');
      }
      const v1: CharacterCardV1 = {
        name: data.name,
        description: data.description,
        personality: data.personality,
        scenario: data.scenario,
        first_mes: data.first_mes,
        mes_example: data.mes_example,
      };
      const jsonStr = JSON.stringify(v1, null, indent);
      const bytes = encoder.encode(jsonStr);
      return {
        fileName: `${cardBaseName}_v1.json`,
        mimeType: 'application/json',
        bytes,
        textPreview: jsonStr,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'char_json_v2' || target === 'char_json_v3') {
      const payload: CharacterCardV2 | CharacterCardV3 =
        target === 'char_json_v3'
          ? {
              spec: 'chara_card_v3',
              spec_version: '3.0',
              data: {
                ...data,
                group_only_greetings: data.group_only_greetings ?? [],
                modification_date: Math.floor(Date.now() / 1000),
              },
            }
          : {
              spec: 'chara_card_v2',
              spec_version: '2.0',
              data,
            };
      const jsonStr = JSON.stringify(payload, null, indent);
      const bytes = encoder.encode(jsonStr);
      return {
        fileName: `${cardBaseName}_${target === 'char_json_v3' ? 'v3' : 'v2'}.json`,
        mimeType: 'application/json',
        bytes,
        textPreview: jsonStr,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'char_png_v2' || target === 'char_png_v3') {
      const basePng =
        customAvatarPng ||
        parsed.avatarPngBytes ||
        createFallbackAvatarPng(256, 340, data.name || cardBaseName);

      if (!customAvatarPng && !parsed.avatarPngBytes) {
        warnings.push('來源為純文字格式，已自動生成預設幾何封面 PNG（您可在上方更換自訂封面圖）。');
      }

      const v2Payload: CharacterCardV2 = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data,
      };
      const v3Payload: CharacterCardV3 = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          ...data,
          group_only_greetings: data.group_only_greetings ?? [],
          modification_date: Math.floor(Date.now() / 1000),
        },
      };

      const chunksToWrite: Record<string, string> = {};
      if (target === 'char_png_v3') {
        chunksToWrite.ccv3 = encodeBase64Utf8(JSON.stringify(v3Payload));
        if (options.embedBothV2AndV3InPng) {
          chunksToWrite.chara = encodeBase64Utf8(JSON.stringify(v2Payload));
        }
      } else {
        chunksToWrite.chara = encodeBase64Utf8(JSON.stringify(v2Payload));
      }

      const pngBytes = writePngTextChunks(basePng, chunksToWrite);
      const previewJson = JSON.stringify(target === 'char_png_v3' ? v3Payload : v2Payload, null, 2);
      return {
        fileName: `${cardBaseName}_${target === 'char_png_v3' ? 'v3' : 'v2'}.png`,
        mimeType: 'image/png',
        bytes: pngBytes,
        textPreview: previewJson,
        isBinary: true,
        warnings,
        outputSize: pngBytes.length,
      };
    }

    if (target === 'charx_v3') {
      const basePng =
        customAvatarPng ||
        parsed.avatarPngBytes ||
        createFallbackAvatarPng(256, 340, data.name || cardBaseName);

      const v3Payload: CharacterCardV3 = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          ...data,
          group_only_greetings: data.group_only_greetings ?? [],
          modification_date: Math.floor(Date.now() / 1000),
          assets: [
            {
              type: 'icon',
              uri: 'embeded://assets/icon/images/main.png',
              name: 'main',
              ext: 'png',
            },
          ],
        },
      };

      const cardJsonStr = JSON.stringify(v3Payload, null, indent);
      const archive = zipSync({
        'card.json': encoder.encode(cardJsonStr),
        'assets/icon/images/main.png': basePng,
      });

      return {
        fileName: `${cardBaseName}.charx`,
        mimeType: 'application/zip',
        bytes: archive,
        textPreview: cardJsonStr,
        isBinary: true,
        warnings,
        outputSize: archive.length,
      };
    }

    if (target === 'char_md') {
      const sections: string[] = [
        `# ${data.name}`,
        '',
        data.creator ? `- **作者**: ${data.creator}` : '',
        data.character_version ? `- **版本**: ${data.character_version}` : '',
        data.tags.length > 0 ? `- **標籤**: ${data.tags.join(', ')}` : '',
        '',
        '## 角色描述 (Description)',
        data.description || '（無）',
        '',
        '## 性格摘要 (Personality)',
        data.personality || '（無）',
        '',
        '## 場景設定 (Scenario)',
        data.scenario || '（無）',
        '',
        '## 開場白 (First Message)',
        data.first_mes || '（無）',
      ];

      if (data.alternate_greetings.length > 0) {
        sections.push('', '## 備用開場白 (Alternate Greetings)');
        data.alternate_greetings.forEach((g, idx) => {
          sections.push(`### 開場白 #${idx + 2}`, g, '');
        });
      }

      if (data.system_prompt) {
        sections.push('', '## 系統提示詞 (System Prompt)', data.system_prompt);
      }

      if (data.mes_example) {
        sections.push('', '## 對話範例 (Example Dialogue)', '```', data.mes_example, '```');
      }

      if (data.character_book && data.character_book.entries.length > 0) {
        sections.push('', `## 內嵌世界書 (${data.character_book.entries.length} 筆)`);
        data.character_book.entries.forEach((entry, idx) => {
          sections.push(
            `### ${idx + 1}. ${entry.comment || entry.name || '條目'}`,
            `- **關鍵字**: ${entry.keys.join(', ') || '（常駐）'}`,
            '',
            entry.content,
            '',
          );
        });
      }

      const md = sections.filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');
      const bytes = encoder.encode(md);
      return {
        fileName: `${cardBaseName}.md`,
        mimeType: 'text/markdown;charset=utf-8',
        bytes,
        textPreview: md,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }
  }

  // ---------------- WORLD INFO ----------------
  if (parsed.category === 'world_info' && parsed.worldInfo) {
    const wi = parsed.worldInfo;
    if (target === 'world_info_st') {
      const jsonStr = JSON.stringify({ entries: wi.entries }, null, indent);
      const bytes = encoder.encode(jsonStr);
      return {
        fileName: `${baseName}_worldinfo.json`,
        mimeType: 'application/json',
        bytes,
        textPreview: jsonStr,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'world_info_charbook') {
      const book = worldInfoToCharacterBook(wi, baseName);
      const jsonStr = JSON.stringify(book, null, indent);
      const bytes = encoder.encode(jsonStr);
      return {
        fileName: `${baseName}_charbook.json`,
        mimeType: 'application/json',
        bytes,
        textPreview: jsonStr,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'world_info_csv') {
      const csv = worldInfoToCsv(wi);
      const bytes = encoder.encode(csv);
      return {
        fileName: `${baseName}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        bytes,
        textPreview: csv.replace(/^\uFEFF/, ''),
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'world_info_md') {
      const entries = Object.values(wi.entries).sort((a, b) => a.order - b.order || a.uid - b.uid);
      const lines: string[] = [`# ${wi.originalName || baseName}（共 ${entries.length} 筆條目）`, ''];
      entries.forEach((e, idx) => {
        lines.push(
          `## ${idx + 1}. ${e.comment || `條目 #${e.uid}`}`,
          `- **狀態**: ${e.disable ? '停用' : '啟用'} · **順序**: ${e.order} · **類型**: ${e.constant ? '常駐藍燈' : '關鍵字綠燈'}`,
          `- **主要關鍵字**: ${e.key.join(', ') || '（無）'}`,
          e.keysecondary.length > 0 ? `- **次要關鍵字**: ${e.keysecondary.join(', ')}` : '',
          '',
          e.content,
          '',
          '---',
          '',
        );
      });
      const md = lines.filter(Boolean).join('\n');
      const bytes = encoder.encode(md);
      return {
        fileName: `${baseName}.md`,
        mimeType: 'text/markdown;charset=utf-8',
        bytes,
        textPreview: md,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }
  }

  // ---------------- CHAT LOG ----------------
  if (parsed.category === 'chat' && parsed.chatLog) {
    const { metadata, messages } = parsed.chatLog;
    const filtered = messages
      .filter((m) => (options.excludeSystemMessages ? !m.is_system : true))
      .map((m) => {
        let resolvedName = m.name;
        if (m.is_user && options.userNameOverride.trim()) {
          resolvedName = options.userNameOverride.trim();
        } else if (!m.is_user && !m.is_system && options.charNameOverride.trim()) {
          resolvedName = options.charNameOverride.trim();
        }
        return { ...m, name: resolvedName };
      });

    if (target === 'chat_jsonl') {
      const metaLine = JSON.stringify({
        ...metadata,
        user_name: options.userNameOverride.trim() || metadata.user_name || 'User',
        character_name: options.charNameOverride.trim() || metadata.character_name || 'Character',
      });
      const lines = [metaLine, ...filtered.map((m) => JSON.stringify(m))];
      const jsonl = lines.join('\n');
      const bytes = encoder.encode(jsonl);
      return {
        fileName: `${baseName}.jsonl`,
        mimeType: 'application/x-ndjson',
        bytes,
        textPreview: jsonl,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'chat_json') {
      const jsonStr = JSON.stringify(filtered, null, indent);
      const bytes = encoder.encode(jsonStr);
      return {
        fileName: `${baseName}_chat.json`,
        mimeType: 'application/json',
        bytes,
        textPreview: jsonStr,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'chat_txt') {
      const blocks = filtered.map((m) => {
        const prefix = m.send_date ? `[${m.send_date}] ` : '';
        return `${prefix}${m.name}: ${m.mes}`;
      });
      const txt = blocks.join('\n\n');
      const bytes = encoder.encode(txt);
      return {
        fileName: `${baseName}.txt`,
        mimeType: 'text/plain;charset=utf-8',
        bytes,
        textPreview: txt,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'chat_md') {
      const title = options.charNameOverride.trim() || metadata.character_name || baseName;
      const lines: string[] = [`# ${title} — 對話紀錄`, ''];
      if (metadata.create_date) {
        lines.push(`建立時間：${metadata.create_date}`, '');
      }
      filtered.forEach((m) => {
        const timePart = m.send_date ? ` (${m.send_date})` : '';
        lines.push(`### ${m.name}${timePart}`, '', m.mes, '');
        if (options.includeSwipes && Array.isArray(m.swipes) && m.swipes.length > 1) {
          m.swipes.forEach((swipe, sIdx) => {
            if (swipe !== m.mes) {
              lines.push(`> 備選回應 #${sIdx + 1}`, `> ${swipe.replace(/\n/g, '\n> ')}`, '');
            }
          });
        }
        lines.push('---', '');
      });
      const md = lines.join('\n');
      const bytes = encoder.encode(md);
      return {
        fileName: `${baseName}.md`,
        mimeType: 'text/markdown;charset=utf-8',
        bytes,
        textPreview: md,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'chat_html') {
      const title = escapeHtml(options.charNameOverride.trim() || metadata.character_name || baseName);
      const msgHtml = filtered
        .map((m) => {
          const roleClass = m.is_system ? 'msg-system' : m.is_user ? 'msg-user' : 'msg-char';
          const dateHtml = m.send_date ? `<span class="time">${escapeHtml(m.send_date)}</span>` : '';
          const bodyHtml = escapeHtml(m.mes).replace(/\n/g, '<br />');
          return `<article class="msg ${roleClass}">
  <header><strong>${escapeHtml(m.name)}</strong>${dateHtml}</header>
  <div class="body">${bodyHtml}</div>
</article>`;
        })
        .join('\n');

      const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title} — 對話存檔</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px 16px; line-height: 1.7; }
  main { max-width: 780px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
  .msg { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-bottom: 14px; }
  .msg-user { background: #f1f5f9; }
  .msg-system { background: #fffbeb; border-color: #fde68a; font-size: 0.92rem; }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; font-size: 0.9rem; color: #334155; }
  .time { font-size: 0.78rem; color: #64748b; }
  .body { white-space: normal; word-break: break-word; }
</style>
</head>
<body>
<main>
  <h1>${title}</h1>
  ${msgHtml}
</main>
</body>
</html>`;
      const bytes = encoder.encode(html);
      return {
        fileName: `${baseName}.html`,
        mimeType: 'text/html;charset=utf-8',
        bytes,
        textPreview: html,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }
  }

  // ---------------- PRESET ----------------
  if (parsed.category === 'preset' && parsed.presetData) {
    const { chatPreset, presetName } = parsed.presetData;
    const presetBase = sanitizeFileName(presetName || baseName);

    if (target === 'preset_chat') {
      const jsonStr = JSON.stringify(chatPreset, null, indent);
      const bytes = encoder.encode(jsonStr);
      return {
        fileName: `${presetBase}_st_preset.json`,
        mimeType: 'application/json',
        bytes,
        textPreview: jsonStr,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'preset_text') {
      if (chatPreset.prompts.some((p) => !p.marker && p.content.trim().length > 0)) {
        warnings.push('Text Completion 預設僅包含採樣參數（temp、top_p、rep_pen 等），自訂 Prompt 區塊不會包含在內。');
      }
      const textPreset = chatPresetToTextPreset(chatPreset);
      const jsonStr = JSON.stringify(textPreset, null, indent);
      const bytes = encoder.encode(jsonStr);
      return {
        fileName: `${presetBase}_text_preset.json`,
        mimeType: 'application/json',
        bytes,
        textPreview: jsonStr,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }

    if (target === 'preset_md') {
      const orderIds = chatPreset.prompt_order[0]?.order ?? [];
      const promptMap = new Map(chatPreset.prompts.map((p) => [p.identifier, p]));
      const lines: string[] = [
        `# ${presetName} — SillyTavern 預設整理`,
        '',
        '## 採樣與上下文參數',
        `- **Temperature**: ${chatPreset.temperature}`,
        `- **Top P**: ${chatPreset.top_p} · **Top K**: ${chatPreset.top_k} · **Min P**: ${chatPreset.min_p}`,
        `- **Frequency Penalty**: ${chatPreset.frequency_penalty} · **Presence Penalty**: ${chatPreset.presence_penalty} · **Repetition Penalty**: ${chatPreset.repetition_penalty}`,
        `- **最大上下文 (Context)**: ${chatPreset.openai_max_context} · **最大輸出 (Max Tokens)**: ${chatPreset.openai_max_tokens}`,
        '',
        `## Prompt 順序與內容（共 ${orderIds.length} 段）`,
        '',
      ];

      orderIds.forEach((item, idx) => {
        const entry = promptMap.get(item.identifier);
        if (!entry) return;
        lines.push(
          `### ${idx + 1}. ${entry.name}（${item.enabled ? '啟用' : '停用'} · ${entry.role}）`,
          entry.marker ? '_[SillyTavern 系統佔位符]_' : entry.content || '（空白內容）',
          '',
        );
      });

      const md = lines.join('\n');
      const bytes = encoder.encode(md);
      return {
        fileName: `${presetBase}.md`,
        mimeType: 'text/markdown;charset=utf-8',
        bytes,
        textPreview: md,
        isBinary: false,
        warnings,
        outputSize: bytes.length,
      };
    }
  }

  throw new Error(`不支援從 ${parsed.detectedFormatLabel} 轉換至 ${target}`);
}

export function createSampleCharacterPng(): { fileName: string; bytes: Uint8Array } {
  const sampleV2: CharacterCardV2 = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: '艾莉絲・格雷（Iris Gray）',
      description:
        '艾莉絲是霧港市立檔案館的夜間修復師，專門處理受潮的羊皮紙與十九世紀航海日誌。她總是戴著黃銅單片眼鏡，隨身攜帶一支會發出微弱藍光的測濕鋼筆。',
      personality: '冷靜、細膩、對舊物有著近乎偏執的溫柔，不善於應付過於熱絡的寒暄。',
      scenario: '暴雨夜的霧港檔案館三樓，唯有桌上的煤油式檯燈還亮著。你剛帶著一疊來歷不明的信件推開木門。',
      first_mes:
        '（她沒有立刻抬頭，只是將沾水筆輕輕擱在黃銅筆架上，指尖壓住剛展開的紙角。）\n\n「門口的雨聲很大……請先把傘留在走廊的銅桶裡。你要修復的東西，是紙張，還是記憶？」',
      mes_example:
        '<START>\n{{user}}: 這封信的字跡已經暈開了。\n{{char}}: 「暈開的不一定是墨水。」她舉起單片眼鏡對準燈光，「有時是寄信人當時手在發抖。」',
      creator_notes: '建議搭配低溫度參數（Temperature 0.75）遊玩，內附霧港世界書條目 2 筆。',
      system_prompt: '保持沉靜、帶有紙墨與雨夜氣息的敘事節奏，避免跳脫維多利亞港城世界觀。',
      post_history_instructions: '',
      alternate_greetings: [
        '「檔案室在十點就閉館了……不過既然你已經淋成這樣，先喝杯熱紅茶吧。」',
      ],
      tags: ['奇幻懸疑', '檔案館', '修復師'],
      creator: 'TavernFormat Sample',
      character_version: '2.1',
      extensions: {},
      character_book: {
        name: '霧港設定集',
        entries: [
          {
            id: 0,
            keys: ['霧港', '檔案館'],
            secondary_keys: ['三樓'],
            comment: '霧港檔案館結構',
            content: '霧港市立檔案館建於 1884 年，三樓專門典藏未公開的遠洋船隻異常報告與失蹤船員名錄。',
            constant: false,
            selective: true,
            insertion_order: 100,
            enabled: true,
            position: 'before_char',
          },
          {
            id: 1,
            keys: ['測濕鋼筆', '藍光'],
            secondary_keys: [],
            comment: '異常器物：測濕鋼筆',
            content: '艾莉絲所持有的鋼筆會在接觸到帶有異常記憶殘留的紙張時發出微弱鈷藍色螢光。',
            constant: false,
            selective: true,
            insertion_order: 110,
            enabled: true,
            position: 'after_char',
          },
        ],
      },
    },
  };

  const basePng = createFallbackAvatarPng(256, 340, 'IrisGray');
  const encoded = encodeBase64Utf8(JSON.stringify(sampleV2));
  const bytes = writePngTextChunks(basePng, { chara: encoded });
  return {
    fileName: 'iris_gray_v2.png',
    bytes,
  };
}

export function createSampleWorldInfoJson(): { fileName: string; bytes: Uint8Array } {
  const sample: WorldInfoFile = {
    entries: {
      '0': {
        ...createDefaultWorldInfoEntry(0),
        uid: 0,
        key: ['星港', '軌道電梯'],
        keysecondary: ['海關'],
        comment: '低軌道星港樞紐',
        content: '「天穹九號」是唯一連接地表與同步軌道的民用電梯站，所有旅客皆需在氣閘室完成生物晶片核驗。',
        order: 100,
        position: 0,
      },
      '1': {
        ...createDefaultWorldInfoEntry(1),
        uid: 1,
        key: ['黑市', '無牌義體'],
        keysecondary: [],
        comment: '下層甲板黑市交易',
        content: '位於反應爐冷卻區背後的非正式集市，只收受未加密的物理信用幣或舊世代晶片。',
        order: 120,
        position: 1,
        depth: 4,
      },
      '2': {
        ...createDefaultWorldInfoEntry(2),
        uid: 2,
        key: [],
        keysecondary: [],
        comment: '全域時間線基調（常駐）',
        content: '當前紀元為新曆 2149 年，軌道資源由三大航運聯合會共同託管。',
        constant: true,
        order: 10,
        position: 0,
      },
    },
  };

  const bytes = new TextEncoder().encode(JSON.stringify({ entries: sample.entries }, null, 2));
  return {
    fileName: 'starport_lorebook.json',
    bytes,
  };
}

export function createSampleChatJsonl(): { fileName: string; bytes: Uint8Array } {
  const lines = [
    JSON.stringify({
      user_name: '旅人',
      character_name: '艾莉絲',
      create_date: '2026-11-14 21:30',
      chat_metadata: { note: 'sample_session' },
    }),
    JSON.stringify({
      name: '系統',
      is_user: false,
      is_system: true,
      send_date: '2026-11-14 21:30',
      mes: '[場景載入：暴雨夜的霧港檔案館]',
    }),
    JSON.stringify({
      name: '艾莉絲',
      is_user: false,
      is_system: false,
      send_date: '2026-11-14 21:31',
      mes: '（她合上桌上的手抄本，抬起眼簾看向剛走進門的你。）\n\n「外頭風浪這麼大，你怎麼會選在這個時間過來？」',
      swipes: [
        '（她合上桌上的手抄本，抬起眼簾看向剛走進門的你。）\n\n「外頭風浪這麼大，你怎麼會選在這個時間過來？」',
        '「十點過後這裡是不對外開放的……不過看在你衣服全濕透的份上，先坐下吧。」',
      ],
      swipe_id: 0,
    }),
    JSON.stringify({
      name: '旅人',
      is_user: true,
      is_system: false,
      send_date: '2026-11-14 21:32',
      mes: '我在舊書店的夾層裡找到這張航海圖，上面印著檔案館的火漆印章。',
    }),
  ];
  return {
    fileName: 'iris_chat_log.jsonl',
    bytes: new TextEncoder().encode(lines.join('\n')),
  };
}
