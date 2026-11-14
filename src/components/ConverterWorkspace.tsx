import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileUp,
  ImagePlus,
} from 'lucide-react';
import {
  CharacterCardDataV2,
  ConversionOptions,
  ParsedPresetData,
  ParsedTavernFile,
  TargetFormatId,
  WorldInfoFile,
} from '../types/sillytavern';
import {
  convertTavernFile,
  formatBytes,
  getAvailableTargets,
} from '../utils/stConverters';
import {
  CharacterInspector,
  ChatLogInspector,
  PresetInspector,
  WorldInfoInspector,
} from './Inspectors';

interface ConverterWorkspaceProps {
  file: ParsedTavernFile | null;
  targetFormat: TargetFormatId | null;
  options: ConversionOptions;
  customAvatarPng?: Uint8Array;
  isDragging: boolean;
  onChangeTarget: (target: TargetFormatId) => void;
  onChangeOptions: (opts: ConversionOptions) => void;
  onUpdateCharacterData: (fileId: string, updated: CharacterCardDataV2) => void;
  onUpdateWorldInfo: (fileId: string, updated: WorldInfoFile) => void;
  onUpdatePresetData: (fileId: string, updated: ParsedPresetData) => void;
  onUploadCustomCover: (fileId: string, pngBytes: Uint8Array) => void;
  onTriggerUpload: () => void;
  onLoadSample: (kind: 'character' | 'world_info' | 'chat' | 'preset') => void;
  onFileDownloadSuccess: (outputFileName: string) => void;
}

type InspectorTab = 'fields' | 'output' | 'raw';

export function ConverterWorkspace({
  file,
  targetFormat,
  options,
  customAvatarPng,
  isDragging,
  onChangeTarget,
  onChangeOptions,
  onUpdateCharacterData,
  onUpdateWorldInfo,
  onUpdatePresetData,
  onUploadCustomCover,
  onTriggerUpload,
  onLoadSample,
  onFileDownloadSuccess,
}: ConverterWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('fields');
  const [copied, setCopied] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCoverError(null);
  }, [file?.id, targetFormat]);

  const targets = useMemo(() => (file ? getAvailableTargets(file) : []), [file]);

  const effectiveTarget: TargetFormatId | null = useMemo(() => {
    if (!file || targets.length === 0) return null;
    if (targetFormat && targets.some((t) => t.id === targetFormat)) {
      return targetFormat;
    }
    return targets[0].id;
  }, [file, targets, targetFormat]);

  const conversionResult = useMemo(() => {
    if (!file || !effectiveTarget) return null;
    try {
      return {
        ok: true as const,
        result: convertTavernFile(file, effectiveTarget, options, customAvatarPng),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : '轉換失敗',
      };
    }
  }, [file, effectiveTarget, options, customAvatarPng]);

  const avatarPreviewUrl = useMemo(() => {
    const bytes = customAvatarPng || file?.avatarPngBytes;
    if (!bytes) return null;
    const blob = new Blob([bytes.slice()], { type: 'image/png' });
    return URL.createObjectURL(blob);
  }, [customAvatarPng, file?.avatarPngBytes]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const handleCoverFileSelected = async (selectedFile: File | null) => {
    if (!selectedFile || !file) return;
    setCoverError(null);
    try {
      const arrayBuf = await selectedFile.arrayBuffer();
      const rawBytes = new Uint8Array(arrayBuf);
      // If already PNG, use directly; otherwise convert via offscreen canvas to PNG
      if (
        rawBytes.length >= 8 &&
        rawBytes[0] === 137 &&
        rawBytes[1] === 80 &&
        rawBytes[2] === 78 &&
        rawBytes[3] === 71
      ) {
        onUploadCustomCover(file.id, rawBytes);
        return;
      }

      const imgUrl = URL.createObjectURL(selectedFile);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('無法讀取圖片格式'));
          el.src = imgUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 512;
        canvas.height = img.naturalHeight || 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('瀏覽器不支援畫布轉換');
        ctx.drawImage(img, 0, 0);
        const pngBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png'),
        );
        if (!pngBlob) throw new Error('圖片轉換 PNG 失敗');
        const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
        onUploadCustomCover(file.id, pngBytes);
      } finally {
        URL.revokeObjectURL(imgUrl);
      }
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : '封面圖讀取失敗');
    }
  };

  const handleDownload = () => {
    if (!conversionResult || !conversionResult.ok) return;
    const { bytes, mimeType, fileName } = conversionResult.result;
    const blob = new Blob([bytes.slice()], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onFileDownloadSuccess(fileName);
  };

  const handleCopy = async () => {
    if (!conversionResult || !conversionResult.ok) return;
    try {
      await navigator.clipboard.writeText(conversionResult.result.textPreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  // Empty Dropzone State
  if (!file) {
    return (
      <section className="flex-1 min-w-0">
        <div
          className={`rounded-xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors ${
            isDragging
              ? 'border-blue-600 bg-blue-50/70'
              : 'border-slate-300 bg-white'
          }`}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
            <FileUp className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 text-balance">
            拖放 SillyTavern 檔案至此，立即自動辨識與無損轉換
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 leading-relaxed">
            支援角色卡（PNG / JSON V1–V3 / CHARX）、世界書（World Info JSON / Character Book / CSV）與聊天紀錄（JSONL / JSON / TXT）。全程於本機瀏覽器運算，不經伺服器上傳。
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onTriggerUpload}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              選擇檔案（支援多選）
            </button>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <p className="text-xs font-medium text-slate-500 mb-3">
              或者直接載入測試範例體驗轉換流程：
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => onLoadSample('character')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                載入角色卡 V2 PNG 範例
              </button>
              <button
                type="button"
                onClick={() => onLoadSample('world_info')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                載入世界書 JSON 範例
              </button>
              <button
                type="button"
                onClick={() => onLoadSample('chat')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                載入聊天紀錄 JSONL 範例
              </button>
              <button
                type="button"
                onClick={() => onLoadSample('preset')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                載入異常預設範例（自動修復）
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">01. 角色卡互轉</h2>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              支援 PNG (chara / ccv3)、JSON (V1/V2/V3) 與 CHARX 封裝互轉，並可一鍵提取角色卡內的隱藏世界書。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">02. 世界書與 CSV</h2>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              SillyTavern 獨立世界書、Character Book 陣列與 Excel 相容 CSV 試算表雙向無損轉換，方便大量編修關鍵字。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">03. 對話紀錄整理</h2>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              將 .jsonl 對話轉為純文字劇本、小說式 Markdown 或離線 HTML 閱讀網頁，也支援將整理後的 TXT 轉回 .jsonl。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">04. 預設診斷修復</h2>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              自動辨別並修復含註解、尾隨逗號、字串數值、別名欄位與遺失 prompt_order 的社群預設檔。
            </p>
          </div>
        </div>
      </section>
    );
  }

  const currentTargetObj = targets.find((t) => t.id === effectiveTarget);

  return (
    <section className="flex-1 min-w-0 space-y-5">
      {/* Header Card: Source Metadata + Avatar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            {file.category === 'character' && (
              <div className="shrink-0">
                <div className="h-24 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center">
                  {avatarPreviewUrl ? (
                    <img
                      src={avatarPreviewUrl}
                      alt={`${file.summary.title} 角色頭像`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-medium text-slate-400">無圖檔</span>
                  )}
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    void handleCoverFileSelected(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="mt-2 w-20 inline-flex items-center justify-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <ImagePlus className="h-3 w-3" aria-hidden="true" />
                  <span>換封面</span>
                </button>
              </div>
            )}

            <div className="min-w-0">
              <p className="text-xs font-medium text-blue-600">{file.detectedFormatLabel}</p>
              <h1 className="mt-1 text-xl font-bold text-slate-900 truncate">
                {file.summary.title}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
                <span>檔名：{file.fileName}</span>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(file.fileSize)}</span>
                <span aria-hidden="true">·</span>
                <span>{file.summary.itemLabel}</span>
                <span aria-hidden="true">·</span>
                <span>約 {file.summary.estimatedTokens.toLocaleString()} Tokens</span>
                {file.summary.hasEmbeddedWorldInfo && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>內嵌世界書 {file.summary.embeddedWorldInfoCount} 筆</span>
                  </>
                )}
              </div>
              {coverError && (
                <p className="mt-2 text-xs text-red-600">{coverError}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {conversionResult?.ok && !conversionResult.result.isBinary && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                    <span>已複製內容</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>複製輸出內容</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              disabled={!conversionResult || !conversionResult.ok}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>下載轉換檔案</span>
            </button>
          </div>
        </div>

        {/* Target Format Picker */}
        <div className="mt-5 pt-5 border-t border-slate-200">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold text-slate-700">選擇目標輸出格式</span>
            {conversionResult?.ok && (
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                輸出：{conversionResult.result.fileName} ({formatBytes(conversionResult.result.outputSize)})
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label="目標輸出格式">
            {targets.map((target) => {
              const active = target.id === effectiveTarget;
              return (
                <button
                  key={target.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChangeTarget(target.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  {target.label}
                </button>
              );
            })}
          </div>

          {currentTargetObj && (
            <p className="mt-2.5 text-xs text-slate-500">{currentTargetObj.description}</p>
          )}

          {/* Contextual Conversion Options */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-slate-100 pt-3.5 text-xs text-slate-700">
            {(effectiveTarget === 'char_json_v1' ||
              effectiveTarget === 'char_json_v2' ||
              effectiveTarget === 'char_json_v3' ||
              effectiveTarget === 'world_info_st' ||
              effectiveTarget === 'world_info_charbook' ||
              effectiveTarget === 'chat_json' ||
              effectiveTarget === 'charx_v3' ||
              effectiveTarget === 'preset_chat' ||
              effectiveTarget === 'preset_text') && (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.prettyJson}
                  onChange={(e) =>
                    onChangeOptions({ ...options, prettyJson: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>JSON 美化縮排（2 空格）</span>
              </label>
            )}

            {effectiveTarget === 'char_png_v3' && (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.embedBothV2AndV3InPng}
                  onChange={(e) =>
                    onChangeOptions({
                      ...options,
                      embedBothV2AndV3InPng: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>同時寫入相容 chara (V2) 與 ccv3 區塊</span>
              </label>
            )}

            {file.category === 'chat' && (
              <>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.excludeSystemMessages}
                    onChange={(e) =>
                      onChangeOptions({
                        ...options,
                        excludeSystemMessages: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>排除系統訊息 (is_system)</span>
                </label>

                {effectiveTarget === 'chat_md' && (
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.includeSwipes}
                      onChange={(e) =>
                        onChangeOptions({
                          ...options,
                          includeSwipes: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>匯出所有備選回應 (Swipes)</span>
                  </label>
                )}

                <div className="flex items-center gap-2">
                  <label htmlFor="override-user" className="text-slate-500">
                    替換 User 名：
                  </label>
                  <input
                    id="override-user"
                    type="text"
                    value={options.userNameOverride}
                    onChange={(e) =>
                      onChangeOptions({ ...options, userNameOverride: e.target.value })
                    }
                    placeholder="保留原名"
                    className="w-28 rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="override-char" className="text-slate-500">
                    替換 Char 名：
                  </label>
                  <input
                    id="override-char"
                    type="text"
                    value={options.charNameOverride}
                    onChange={(e) =>
                      onChangeOptions({ ...options, charNameOverride: e.target.value })
                    }
                    placeholder="保留原名"
                    className="w-28 rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>

          {conversionResult?.ok && conversionResult.result.warnings.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                {conversionResult.result.warnings.map((w, idx) => (
                  <p key={idx}>{w}</p>
                ))}
              </div>
            </div>
          )}

          {conversionResult && !conversionResult.ok && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
              <p>{conversionResult.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabbed Inspector Panel */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div
          role="tablist"
          aria-label="檔案內容檢視模式"
          className="flex items-center gap-1 border-b border-slate-200 px-4 pt-3"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'fields'}
            onClick={() => setActiveTab('fields')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'fields'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            結構檢視與編輯
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'output'}
            onClick={() => setActiveTab('output')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'output'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            輸出預覽
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'raw'}
            onClick={() => setActiveTab('raw')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'raw'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            中繼資料與區塊資訊
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {activeTab === 'fields' && (
            <>
              {file.category === 'character' && file.characterData && (
                <CharacterInspector
                  data={file.characterData}
                  onChange={(updated) => onUpdateCharacterData(file.id, updated)}
                />
              )}
              {file.category === 'world_info' && file.worldInfo && (
                <WorldInfoInspector
                  worldInfo={file.worldInfo}
                  onChange={(updated) => onUpdateWorldInfo(file.id, updated)}
                />
              )}
              {file.category === 'chat' && file.chatLog && (
                <ChatLogInspector
                  chatLog={file.chatLog}
                  excludeSystem={options.excludeSystemMessages}
                />
              )}
              {file.category === 'preset' && file.presetData && (
                <PresetInspector
                  presetData={file.presetData}
                  onChange={(updated) => onUpdatePresetData(file.id, updated)}
                />
              )}
            </>
          )}

          {activeTab === 'output' && conversionResult?.ok && (
            <div className="space-y-3">
              {conversionResult.result.isBinary && (
                <p className="text-xs text-slate-500">
                  此目標為二進位封裝格式（{conversionResult.result.fileName}），下方顯示嵌入於封裝內的中繼 JSON 內容：
                </p>
              )}
              <pre className="max-h-[520px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {conversionResult.result.textPreview}
              </pre>
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 mb-2">來源檔案偵測結果</h3>
                  <dl className="space-y-1.5 text-slate-600">
                    <div className="flex justify-between gap-4">
                      <dt>格式代碼</dt>
                      <dd className="font-mono text-slate-900">{file.detectedFormat}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>檔案大小</dt>
                      <dd className="font-mono tabular-nums text-slate-900">
                        {file.fileSize.toLocaleString()} bytes
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>預估 Token</dt>
                      <dd className="font-mono tabular-nums text-slate-900">
                        ~{file.summary.estimatedTokens.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 mb-2">偵測到的內部區塊 / 路徑</h3>
                  {file.summary.pngChunksFound && file.summary.pngChunksFound.length > 0 ? (
                    <p className="font-mono text-slate-700 leading-relaxed">
                      {file.summary.pngChunksFound.join(' · ')}
                    </p>
                  ) : (
                    <p className="text-slate-500">
                      {file.category === 'chat'
                        ? '標準行式對話紀錄 / JSON 結構'
                        : '標準純文字結構（無二進位區塊）'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
