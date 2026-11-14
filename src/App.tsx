import { useCallback, useRef, useState, type DragEvent } from 'react';
import { zipSync } from 'fflate';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  CharacterCardDataV2,
  ConversionOptions,
  ParsedPresetData,
  ParsedTavernFile,
  TargetFormatId,
  WorldInfoFile,
} from './types/sillytavern';
import {
  DEFAULT_CONVERSION_OPTIONS,
  convertTavernFile,
  createSampleCharacterPng,
  createSampleChatJsonl,
  createSampleWorldInfoJson,
  estimateTokens,
  getAvailableTargets,
  parseTavernFile,
} from './utils/stConverters';
import { createSampleMalformedPreset } from './utils/presetRepair';
import { ActiveNavView, TopBar } from './components/TopBar';
import { FileQueueSidebar } from './components/FileQueueSidebar';
import { ConverterWorkspace } from './components/ConverterWorkspace';
import { FormatMatrixView } from './components/FormatMatrixView';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveNavView>('workspace');
  const [files, setFiles] = useState<ParsedTavernFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetByFileId, setTargetByFileId] = useState<Record<string, TargetFormatId>>({});
  const [customCovers, setCustomCovers] = useState<Record<string, Uint8Array>>({});
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_CONVERSION_OPTIONS);
  const [isDragging, setIsDragging] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ingestBytes = useCallback((fileName: string, bytes: Uint8Array) => {
    const parsed = parseTavernFile(fileName, bytes);
    const defaultTarget = getAvailableTargets(parsed)[0]?.id;
    setFiles((prev) => [parsed, ...prev]);
    setSelectedId(parsed.id);
    if (defaultTarget) {
      setTargetByFileId((prev) => ({ ...prev, [parsed.id]: defaultTarget }));
    }
    setActiveView('workspace');
  }, []);

  const handleFileList = useCallback(
    async (fileList: FileList | File[]) => {
      const items = Array.from(fileList);
      if (items.length === 0) return;

      setErrorBanner(null);
      setStatusBanner(null);

      const errors: string[] = [];
      let successCount = 0;

      for (const item of items) {
        try {
          const buf = await item.arrayBuffer();
          ingestBytes(item.name, new Uint8Array(buf));
          successCount++;
        } catch (err) {
          errors.push(
            `${item.name}：${err instanceof Error ? err.message : '無法解析檔案'}`,
          );
        }
      }

      if (errors.length > 0) {
        setErrorBanner(errors.join('；'));
      }
      if (successCount > 0 && items.length > 1) {
        setStatusBanner(`已成功匯入 ${successCount} 個檔案`);
      }
    },
    [ingestBytes],
  );

  const handleLoadSample = useCallback(
    (kind: 'character' | 'world_info' | 'chat' | 'preset') => {
      setErrorBanner(null);
      setStatusBanner(null);
      try {
        const sample =
          kind === 'character'
            ? createSampleCharacterPng()
            : kind === 'world_info'
              ? createSampleWorldInfoJson()
              : kind === 'preset'
                ? createSampleMalformedPreset()
                : createSampleChatJsonl();
        ingestBytes(sample.fileName, sample.bytes);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : '載入範例失敗');
      }
    },
    [ingestBytes],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFileList(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setFiles([]);
    setSelectedId(null);
    setTargetByFileId({});
    setCustomCovers({});
    setErrorBanner(null);
    setStatusBanner(null);
  };

  const handleUpdateCharacterData = (fileId: string, updated: CharacterCardDataV2) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const combinedText = [
          updated.description,
          updated.personality,
          updated.scenario,
          updated.first_mes,
          updated.mes_example,
          updated.system_prompt,
          ...updated.alternate_greetings,
        ].join('\n');
        return {
          ...f,
          characterData: updated,
          summary: {
            ...f.summary,
            title: updated.name || '未命名角色',
            estimatedTokens: estimateTokens(combinedText),
          },
        };
      }),
    );
  };

  const handleUpdateWorldInfo = (fileId: string, updated: WorldInfoFile) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const entries = Object.values(updated.entries);
        return {
          ...f,
          worldInfo: updated,
          summary: {
            ...f.summary,
            itemCount: entries.length,
            itemLabel: `${entries.length} 筆條目`,
            estimatedTokens: estimateTokens(entries.map((e) => e.content).join('\n')),
          },
        };
      }),
    );
  };

  const handleUpdatePresetData = (fileId: string, updated: ParsedPresetData) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const promptText = updated.chatPreset.prompts.map((p) => p.content).join('\n');
        return {
          ...f,
          presetData: updated,
          summary: {
            ...f.summary,
            itemCount: updated.chatPreset.prompts.length,
            itemLabel: `${updated.chatPreset.prompts.length} 段提示詞`,
            estimatedTokens: estimateTokens(promptText),
          },
        };
      }),
    );
  };

  const handleBatchZipExport = () => {
    if (files.length === 0) return;
    setErrorBanner(null);

    const zipEntries: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();

    for (const f of files) {
      const target = targetByFileId[f.id] || getAvailableTargets(f)[0]?.id;
      if (!target) continue;
      const result = convertTavernFile(f, target, options, customCovers[f.id]);
      let outName = result.fileName;
      let counter = 2;
      while (usedNames.has(outName)) {
        const dotIdx = result.fileName.lastIndexOf('.');
        outName =
          dotIdx > 0
            ? `${result.fileName.slice(0, dotIdx)}_${counter}${result.fileName.slice(dotIdx)}`
            : `${result.fileName}_${counter}`;
        counter++;
      }
      usedNames.add(outName);
      zipEntries[outName] = result.bytes;
    }

    const zipBytes = zipSync(zipEntries);
    const blob = new Blob([zipBytes.slice()], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tavernformat_batch.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatusBanner(`已打包並下載 ${Object.keys(zipEntries).length} 個轉換檔案（tavernformat_batch.zip）`);
  };

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".png,.charx,.json,.jsonl,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            void handleFileList(e.target.files);
            e.target.value = '';
          }
        }}
      />

      <TopBar
        activeView={activeView}
        onChangeView={setActiveView}
        onTriggerUpload={() => fileInputRef.current?.click()}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
        {errorBanner && (
          <div
            role="alert"
            className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              aria-label="關閉錯誤訊息"
              className="rounded p-1 text-red-600 hover:bg-red-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {statusBanner && (
          <div
            role="status"
            className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" aria-hidden="true" />
              <span>{statusBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="關閉通知"
              className="rounded p-1 text-green-700 hover:bg-green-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {activeView === 'workspace' ? (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <FileQueueSidebar
              files={files}
              selectedId={selectedId}
              onSelectFile={setSelectedId}
              onRemoveFile={handleRemoveFile}
              onClearAll={handleClearAll}
              onTriggerUpload={() => fileInputRef.current?.click()}
              onLoadSample={handleLoadSample}
              onBatchZipExport={handleBatchZipExport}
            />

            <ConverterWorkspace
              file={selectedFile}
              targetFormat={selectedFile ? (targetByFileId[selectedFile.id] ?? null) : null}
              options={options}
              customAvatarPng={selectedFile ? customCovers[selectedFile.id] : undefined}
              isDragging={isDragging}
              onChangeTarget={(target) => {
                if (selectedFile) {
                  setTargetByFileId((prev) => ({ ...prev, [selectedFile.id]: target }));
                }
              }}
              onChangeOptions={setOptions}
              onUpdateCharacterData={handleUpdateCharacterData}
              onUpdateWorldInfo={handleUpdateWorldInfo}
              onUpdatePresetData={handleUpdatePresetData}
              onUploadCustomCover={(fileId, pngBytes) =>
                setCustomCovers((prev) => ({ ...prev, [fileId]: pngBytes }))
              }
              onTriggerUpload={() => fileInputRef.current?.click()}
              onLoadSample={handleLoadSample}
              onFileDownloadSuccess={(name) =>
                setStatusBanner(`已匯出檔案：${name}`)
              }
            />
          </div>
        ) : (
          <FormatMatrixView
            mode={activeView}
            onGoToWorkspace={() => setActiveView('workspace')}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>TavernFormat · 純本機瀏覽器端運算，無檔案上傳行為</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveView('matrix')}
              className="hover:text-slate-900 transition-colors"
            >
              支援格式一覽
            </button>
            <button
              type="button"
              onClick={() => setActiveView('privacy')}
              className="hover:text-slate-900 transition-colors"
            >
              隱私與編碼架構
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
