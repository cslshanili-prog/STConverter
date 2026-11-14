import { Archive, FilePlus2, Trash2, X } from 'lucide-react';
import { ParsedTavernFile } from '../types/sillytavern';
import { formatBytes } from '../utils/stConverters';

interface FileQueueSidebarProps {
  files: ParsedTavernFile[];
  selectedId: string | null;
  onSelectFile: (id: string) => void;
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
  onTriggerUpload: () => void;
  onLoadSample: (kind: 'character' | 'world_info' | 'chat' | 'preset') => void;
  onBatchZipExport: () => void;
}

export function FileQueueSidebar({
  files,
  selectedId,
  onSelectFile,
  onRemoveFile,
  onClearAll,
  onTriggerUpload,
  onLoadSample,
  onBatchZipExport,
}: FileQueueSidebarProps) {
  return (
    <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">檔案佇列 ({files.length})</h2>
          {files.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>全部清除</span>
            </button>
          )}
        </div>

        {files.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            <p className="mb-3">尚未匯入任何檔案</p>
            <button
              type="button"
              onClick={onTriggerUpload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>選擇本機檔案</span>
            </button>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5 max-h-[380px] overflow-y-auto pr-0.5">
            {files.map((file) => {
              const isSelected = file.id === selectedId;
              return (
                <li
                  key={file.id}
                  className={`group flex items-start justify-between gap-2 rounded-lg border p-2.5 transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectFile(file.id)}
                    className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-blue-600"
                  >
                    <p className="truncate text-sm font-medium text-slate-900">
                      {file.summary.title || file.fileName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                      {file.detectedFormatLabel} · {formatBytes(file.fileSize)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveFile(file.id)}
                    aria-label={`移除 ${file.fileName}`}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {files.length > 1 && (
          <button
            type="button"
            onClick={onBatchZipExport}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            <span>一鍵批次打包轉換 (.zip)</span>
          </button>
        )}
      </div>

      <div
        className={`rounded-xl border border-slate-200 bg-white p-4 ${
          files.length > 0 ? 'hidden lg:block' : ''
        }`}
      >
        <h2 className="text-sm font-semibold text-slate-900">快速載入測試範例</h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          手邊沒有檔案時，可直接載入內建範例測試解析與格式轉換。
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onLoadSample('character')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
          >
            角色卡範例（PNG V2 + 內嵌世界書）
          </button>
          <button
            type="button"
            onClick={() => onLoadSample('world_info')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
          >
            世界書範例（World Info JSON）
          </button>
          <button
            type="button"
            onClick={() => onLoadSample('chat')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
          >
            聊天紀錄範例（SillyTavern JSONL）
          </button>
          <button
            type="button"
            onClick={() => onLoadSample('preset')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
          >
            異常預設範例（自動修復測試）
          </button>
        </div>
      </div>
    </aside>
  );
}
