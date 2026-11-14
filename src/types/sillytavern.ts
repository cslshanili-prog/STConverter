export type TavernCategory = 'character' | 'world_info' | 'chat' | 'preset';

export type DetectedFormatId =
  | 'char_png_v2'
  | 'char_png_v3'
  | 'char_png_v1'
  | 'char_json_v1'
  | 'char_json_v2'
  | 'char_json_v3'
  | 'charx_v3'
  | 'world_info_st'
  | 'world_info_charbook'
  | 'world_info_csv'
  | 'chat_jsonl'
  | 'chat_json'
  | 'chat_txt'
  | 'preset_chat'
  | 'preset_text'
  | 'preset_repaired';

export type TargetFormatId =
  | 'char_json_v3'
  | 'char_json_v2'
  | 'char_json_v1'
  | 'char_png_v2'
  | 'char_png_v3'
  | 'charx_v3'
  | 'char_md'
  | 'world_info_st'
  | 'world_info_charbook'
  | 'world_info_csv'
  | 'world_info_md'
  | 'chat_jsonl'
  | 'chat_json'
  | 'chat_txt'
  | 'chat_md'
  | 'chat_html'
  | 'preset_chat'
  | 'preset_text'
  | 'preset_md';

export interface CharacterBookEntry {
  id?: number | string;
  keys: string[];
  secondary_keys?: string[];
  comment?: string;
  content: string;
  constant?: boolean;
  selective?: boolean;
  insertion_order?: number;
  enabled?: boolean;
  position?: string | number;
  priority?: number;
  case_sensitive?: boolean;
  name?: string;
  extensions?: Record<string, unknown>;
}

export interface CharacterBook {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions?: Record<string, unknown>;
  entries: CharacterBookEntry[];
}

export interface CharacterAsset {
  type: string;
  uri: string;
  name: string;
  ext: string;
}

export interface CharacterCardDataV2 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  character_book?: CharacterBook;
  tags: string[];
  creator: string;
  character_version: string;
  extensions: Record<string, unknown>;
  // V3 extensions
  group_only_greetings?: string[];
  nickname?: string;
  source?: string[];
  creation_date?: number;
  modification_date?: number;
  assets?: CharacterAsset[];
}

export interface CharacterCardV2 {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: CharacterCardDataV2;
}

export interface CharacterCardV3 {
  spec: 'chara_card_v3';
  spec_version: '3.0';
  data: CharacterCardDataV2;
}

export interface CharacterCardV1 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  talkativeness?: string | number;
  fav?: boolean;
  [key: string]: unknown;
}

export interface WorldInfoEntry {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  vectorized: boolean;
  selective: boolean;
  selectiveLogic: number;
  addMemo: boolean;
  order: number;
  position: number;
  disable: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delayUntilRecursion: boolean;
  probability: number;
  useProbability: boolean;
  depth: number;
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  scanDepth: number | null;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  useGroupScoring: boolean | null;
  automationId: string;
  role: number | null;
  sticky: number;
  cooldown: number;
  delay: number;
  displayIndex?: number;
}

export interface WorldInfoFile {
  entries: Record<string, WorldInfoEntry>;
  originalName?: string;
}

export interface ChatMetadata {
  user_name?: string;
  character_name?: string;
  create_date?: string;
  chat_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChatMessage {
  name: string;
  is_user: boolean;
  is_system?: boolean;
  send_date?: string;
  mes: string;
  swipes?: string[];
  swipe_id?: number;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParsedChatLog {
  metadata: ChatMetadata;
  messages: ChatMessage[];
}

export interface ConversionOptions {
  prettyJson: boolean;
  embedBothV2AndV3InPng: boolean;
  includeSwipes: boolean;
  excludeSystemMessages: boolean;
  userNameOverride: string;
  charNameOverride: string;
}

export interface TargetFormatOption {
  id: TargetFormatId;
  label: string;
  shortLabel: string;
  extension: string;
  description: string;
}

export interface PresetPromptEntry {
  identifier: string;
  name: string;
  system_prompt: boolean;
  role: 'system' | 'user' | 'assistant';
  content: string;
  injection_position: number;
  injection_depth: number;
  injection_order: number;
  forbid_overrides: boolean;
  marker?: boolean;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface PresetPromptOrderItem {
  identifier: string;
  enabled: boolean;
}

export interface PresetPromptOrderBlock {
  character_id: number;
  order: PresetPromptOrderItem[];
}

export interface PresetRepairIssue {
  kind: 'syntax' | 'alias' | 'type' | 'structure' | 'range';
  field: string;
  message: string;
}

export interface SillyTavernChatPreset {
  chat_completion_source?: string;
  openai_model?: string;
  temperature: number;
  frequency_penalty: number;
  presence_penalty: number;
  top_p: number;
  top_k: number;
  top_a: number;
  min_p: number;
  repetition_penalty: number;
  openai_max_context: number;
  openai_max_tokens: number;
  wrap_in_quotes: boolean;
  names_behavior: number;
  send_if_empty: string;
  impersonation_prompt: string;
  new_chat_prompt: string;
  new_group_chat_prompt: string;
  new_example_chat_prompt: string;
  continue_nudge_prompt: string;
  bias_preset_selected: string;
  max_context_unlocked: boolean;
  wi_format: string;
  scenario_format: string;
  personality_format: string;
  group_nudge_prompt: string;
  stream_openai: boolean;
  prompts: PresetPromptEntry[];
  prompt_order: PresetPromptOrderBlock[];
  assistant_prefill?: string;
  assistant_impersonation?: string;
  claude_use_sysprompt?: boolean;
  use_makersuite_sysprompt?: boolean;
  squash_system_messages?: boolean;
  [key: string]: unknown;
}

export interface SillyTavernTextPreset {
  temp: number;
  temperature_last?: boolean;
  top_p: number;
  top_k: number;
  top_a: number;
  tfs: number;
  epsilon_cutoff: number;
  eta_cutoff: number;
  typical_p: number;
  min_p: number;
  rep_pen: number;
  rep_pen_range: number;
  rep_pen_decay: number;
  rep_pen_slope: number;
  no_repeat_ngram_size: number;
  penalty_alpha: number;
  num_beams: number;
  length_penalty: number;
  min_length: number;
  encoder_rep_pen: number;
  do_sample: boolean;
  early_stopping: boolean;
  seed: number;
  max_length: number;
  max_context: number;
  mirostat_mode: number;
  mirostat_tau: number;
  mirostat_eta: number;
  [key: string]: unknown;
}

export interface ParsedPresetData {
  sourceKind: 'chat_completion' | 'text_completion' | 'fragment';
  presetName: string;
  chatPreset: SillyTavernChatPreset;
  repairIssues: PresetRepairIssue[];
}

export interface ParsedFileSummary {
  title: string;
  subtitle: string;
  estimatedTokens: number;
  itemCount: number;
  itemLabel: string;
  hasEmbeddedWorldInfo?: boolean;
  embeddedWorldInfoCount?: number;
  pngChunksFound?: string[];
  repairCount?: number;
}

export interface ParsedTavernFile {
  id: string;
  fileName: string;
  fileSize: number;
  category: TavernCategory;
  detectedFormat: DetectedFormatId;
  detectedFormatLabel: string;
  summary: ParsedFileSummary;
  avatarPngBytes?: Uint8Array;
  characterData?: CharacterCardDataV2;
  worldInfo?: WorldInfoFile;
  chatLog?: ParsedChatLog;
  presetData?: ParsedPresetData;
}

export interface ConversionResult {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  textPreview: string;
  isBinary: boolean;
  warnings: string[];
  outputSize: number;
}
