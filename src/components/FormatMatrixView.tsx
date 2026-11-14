interface FormatMatrixViewProps {
  mode: 'matrix' | 'privacy';
  onGoToWorkspace: () => void;
}

export function FormatMatrixView({ mode, onGoToWorkspace }: FormatMatrixViewProps) {
  if (mode === 'privacy') {
    return (
      <section className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            純瀏覽器離線解析與隱私保障
          </h1>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-2xl">
            所有 SillyTavern 檔案的解析、PNG 二進位區塊寫入、CHARX 壓縮封裝、CSV 轉檔與聊天紀錄格式化，均完全在您的本機瀏覽器記憶體中執行，不會將任何角色設定、私人對話或圖片上傳至遠端伺服器。
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3 border-t border-slate-200 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">01. PNG 區塊讀寫</h2>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                直接於前端解析 PNG 的 <code className="font-mono text-slate-800">tEXt</code>、<code className="font-mono text-slate-800">zTXt</code> 與 <code className="font-mono text-slate-800">iTXt</code> 區塊並重新計算 CRC32 校驗碼，完整保留繁體中文與 Emoji 編碼。
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">02. UTF-8 與 BOM 相容</h2>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                匯出世界書 CSV 時自動加上 UTF-8 BOM 標記，確保 Microsoft Excel 與 Google Sheets 直接雙擊開啟不亂碼，並支援引號與換行轉義。
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">03. 斷網亦可使用</h2>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                頁面載入後即可處理大型聊天紀錄與數百筆世界書條目，無檔案數量或頻寬限制。
              </p>
            </div>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={onGoToWorkspace}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              返回轉換工作台
            </button>
          </div>
        </div>
      </section>
    );
  }

  const rows = [
    {
      category: '角色卡 (Character Card)',
      inputs: '.png (V1 / V2 / V3) · .json (V1 / V2 / V3) · .charx',
      outputs: 'PNG (V2 / V3) · JSON (V1 / V2 / V3) · CHARX · Markdown · 提取世界書 JSON',
      notes: 'V3 PNG 預設同時寫入 ccv3 與相容 chara 區塊；支援於轉換前替換封面圖片或編輯欄位。',
    },
    {
      category: '世界書 (World Info / Lorebook)',
      inputs: 'SillyTavern JSON (Object Map) · Character Book JSON (Array) · .csv',
      outputs: 'SillyTavern JSON · Character Book JSON · CSV 表格 · Markdown 清單',
      notes: '雙向對應 key、secondary_keys、order、position、depth、constant、probability 與遞迴旗標。',
    },
    {
      category: '聊天紀錄 (Chat Logs)',
      inputs: '.jsonl (SillyTavern 原生) · .json (對話陣列) · .txt (角色名: 內容)',
      outputs: '.jsonl · 小說式 .md · 純文字 .txt · 獨立閱讀 .html · .json',
      notes: '可選擇隱藏系統訊息、匯出所有 Swipe 備選回應，或批次替換角色與使用者名稱。',
    },
    {
      category: '預設檔 (Preset / 自動修復)',
      inputs: 'Chat Completion JSON · Text Completion JSON · 含註解／尾隨逗號／別名之異常 JSON',
      outputs: '標準 Chat Completion 預設 · Text Completion 預設 · Markdown 整理',
      notes: '可自動修復 JSON 註解與尾隨逗號、字串化數值、temp/max_tokens 別名欄位，以及不同步的 prompt_order。',
    },
  ];

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              支援格式與轉換矩陣
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              匯入檔案時會自動偵測結構與版本，無須手動選擇來源類型。
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToWorkspace}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            前往工作台轉換
          </button>
        </div>

        <div className="mt-6 divide-y divide-slate-200">
          {rows.map((row) => (
            <div key={row.category} className="py-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <h2 className="text-sm font-semibold text-slate-900">{row.category}</h2>
              </div>
              <div className="lg:col-span-4">
                <p className="text-xs font-medium text-slate-500">可匯入格式</p>
                <p className="mt-1 text-sm text-slate-800 font-mono">{row.inputs}</p>
              </div>
              <div className="lg:col-span-5">
                <p className="text-xs font-medium text-slate-500">可轉換輸出</p>
                <p className="mt-1 text-sm text-slate-800">{row.outputs}</p>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{row.notes}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
