import { useMemo, useState } from 'react';
import { CheckCircle2, Search, Wrench } from 'lucide-react';
import {
  CharacterCardDataV2,
  ParsedChatLog,
  ParsedPresetData,
  SillyTavernChatPreset,
  WorldInfoFile,
} from '../types/sillytavern';

interface CharacterInspectorProps {
  data: CharacterCardDataV2;
  onChange: (updated: CharacterCardDataV2) => void;
}

export function CharacterInspector({ data, onChange }: CharacterInspectorProps) {
  const updateField = <K extends keyof CharacterCardDataV2>(
    key: K,
    value: CharacterCardDataV2[K],
  ) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="char-name" className="block text-xs font-medium text-slate-700 mb-1">
            角色名稱 (name)
          </label>
          <input
            id="char-name"
            type="text"
            value={data.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="char-creator" className="block text-xs font-medium text-slate-700 mb-1">
            作者 (creator)
          </label>
          <input
            id="char-creator"
            type="text"
            value={data.creator}
            onChange={(e) => updateField('creator', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="char-version" className="block text-xs font-medium text-slate-700 mb-1">
            版本號 (character_version)
          </label>
          <input
            id="char-version"
            type="text"
            value={data.character_version}
            onChange={(e) => updateField('character_version', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="char-tags" className="block text-xs font-medium text-slate-700 mb-1">
            標籤（以逗號分隔）
          </label>
          <input
            id="char-tags"
            type="text"
            value={data.tags.join(', ')}
            onChange={(e) =>
              updateField(
                'tags',
                e.target.value
                  .split(/[,，]/)
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label htmlFor="char-description" className="block text-xs font-medium text-slate-700 mb-1">
          角色描述 (description)
        </label>
        <textarea
          id="char-description"
          rows={4}
          value={data.description}
          onChange={(e) => updateField('description', e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 leading-relaxed focus:border-blue-600 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="char-personality" className="block text-xs font-medium text-slate-700 mb-1">
            性格摘要 (personality)
          </label>
          <textarea
            id="char-personality"
            rows={3}
            value={data.personality}
            onChange={(e) => updateField('personality', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 leading-relaxed focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="char-scenario" className="block text-xs font-medium text-slate-700 mb-1">
            場景設定 (scenario)
          </label>
          <textarea
            id="char-scenario"
            rows={3}
            value={data.scenario}
            onChange={(e) => updateField('scenario', e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 leading-relaxed focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label htmlFor="char-first-mes" className="block text-xs font-medium text-slate-700 mb-1">
          開場白 (first_mes)
        </label>
        <textarea
          id="char-first-mes"
          rows={4}
          value={data.first_mes}
          onChange={(e) => updateField('first_mes', e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 leading-relaxed focus:border-blue-600 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="char-system-prompt" className="block text-xs font-medium text-slate-700 mb-1">
          系統提示詞 (system_prompt)
        </label>
        <textarea
          id="char-system-prompt"
          rows={2}
          value={data.system_prompt}
          onChange={(e) => updateField('system_prompt', e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 leading-relaxed focus:border-blue-600 focus:outline-none"
        />
      </div>

      {data.character_book && data.character_book.entries.length > 0 && (
        <div className="pt-2 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            內嵌世界書條目（{data.character_book.entries.length} 筆）
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 font-medium">條目名稱</th>
                  <th className="px-3 py-2 font-medium">觸發關鍵字</th>
                  <th className="px-3 py-2 font-medium text-right">順序</th>
                  <th className="px-3 py-2 font-medium">內容摘要</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.character_book.entries.map((entry, idx) => (
                  <tr key={String(entry.id ?? idx)} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                      {entry.comment || entry.name || `條目 #${idx + 1}`}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {entry.constant ? '常駐藍燈' : entry.keys.join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600">
                      {entry.insertion_order ?? 100}
                    </td>
                    <td className="px-3 py-2 text-slate-600 max-w-xs truncate">
                      {entry.content}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface WorldInfoInspectorProps {
  worldInfo: WorldInfoFile;
  onChange: (updated: WorldInfoFile) => void;
}

export function WorldInfoInspector({ worldInfo, onChange }: WorldInfoInspectorProps) {
  const [query, setQuery] = useState('');

  const entries = useMemo(() => {
    const list = Object.values(worldInfo.entries).sort(
      (a, b) => a.order - b.order || a.uid - b.uid,
    );
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.comment.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.key.some((k) => k.toLowerCase().includes(q)),
    );
  }, [worldInfo, query]);

  const toggleDisable = (uid: number) => {
    const key = String(uid);
    const existing = worldInfo.entries[key];
    if (!existing) return;
    onChange({
      ...worldInfo,
      entries: {
        ...worldInfo.entries,
        [key]: { ...existing, disable: !existing.disable },
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋關鍵字、條目備註或內容..."
            aria-label="搜尋世界書條目"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>
        <p className="text-xs text-slate-500 tabular-nums">
          顯示 {entries.length} / {Object.keys(worldInfo.entries).length} 筆條目
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5 font-medium">啟用</th>
              <th className="px-3 py-2.5 font-medium">UID</th>
              <th className="px-3 py-2.5 font-medium">備註名稱</th>
              <th className="px-3 py-2.5 font-medium">觸發模式 / 關鍵字</th>
              <th className="px-3 py-2.5 font-medium text-right">順序</th>
              <th className="px-3 py-2.5 font-medium">內容預覽</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  找不到符合「{query}」的條目
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.uid} className="hover:bg-slate-50 align-top">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={!entry.disable}
                      onChange={() => toggleDisable(entry.uid)}
                      aria-label={`切換條目 ${entry.comment || entry.uid} 啟用狀態`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-slate-500">
                    {entry.uid}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                    {entry.comment || `條目 #${entry.uid}`}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 min-w-[140px]">
                    {entry.constant ? '常駐（藍燈）' : entry.key.join(', ') || '未設定'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {entry.order}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-md whitespace-pre-wrap leading-relaxed">
                    {entry.content}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ChatLogInspectorProps {
  chatLog: ParsedChatLog;
  excludeSystem: boolean;
}

export function ChatLogInspector({ chatLog, excludeSystem }: ChatLogInspectorProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const base = excludeSystem
      ? chatLog.messages.filter((m) => !m.is_system)
      : chatLog.messages;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (m) => m.name.toLowerCase().includes(q) || m.mes.toLowerCase().includes(q),
    );
  }, [chatLog.messages, excludeSystem, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋發言者或對話內容..."
            aria-label="搜尋對話紀錄"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>
        <p className="text-xs text-slate-500 tabular-nums">
          顯示 {filtered.length} / {chatLog.messages.length} 則訊息
        </p>
      </div>

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            沒有符合條件的對話內容
          </div>
        ) : (
          filtered.map((msg, idx) => {
            const roleLabel = msg.is_system ? '系統' : msg.is_user ? '使用者' : '角色';
            const swipeCount = Array.isArray(msg.swipes) ? msg.swipes.length : 0;
            return (
              <article key={idx} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-sm">{msg.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{roleLabel}</span>
                    {swipeCount > 1 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">含 {swipeCount} 組 Swipe</span>
                      </>
                    )}
                  </div>
                  {msg.send_date && <span className="font-mono tabular-nums">{msg.send_date}</span>}
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {msg.mes}
                </p>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

interface PresetInspectorProps {
  presetData: ParsedPresetData;
  onChange: (updated: ParsedPresetData) => void;
}

const REPAIR_KIND_LABELS: Record<string, string> = {
  syntax: '語法修復',
  alias: '欄位映射',
  type: '型別轉正',
  structure: '結構重建',
  range: '數值校正',
};

export function PresetInspector({ presetData, onChange }: PresetInspectorProps) {
  const { chatPreset, repairIssues } = presetData;

  const updateNumberParam = (
    key: keyof SillyTavernChatPreset,
    rawVal: string,
  ) => {
    const num = Number(rawVal);
    if (!Number.isFinite(num)) return;
    onChange({
      ...presetData,
      chatPreset: {
        ...chatPreset,
        [key]: num,
      },
    });
  };

  const togglePromptEnabled = (identifier: string) => {
    const currentOrder = chatPreset.prompt_order[0]?.order ?? [];
    const nextOrder = currentOrder.map((o) =>
      o.identifier === identifier ? { ...o, enabled: !o.enabled } : o,
    );
    const enabledMap = new Map(nextOrder.map((o) => [o.identifier, o.enabled]));
    const nextPrompts = chatPreset.prompts.map((p) =>
      p.identifier === identifier
        ? { ...p, enabled: enabledMap.get(identifier) ?? true }
        : p,
    );
    onChange({
      ...presetData,
      chatPreset: {
        ...chatPreset,
        prompts: nextPrompts,
        prompt_order: [
          {
            character_id: chatPreset.prompt_order[0]?.character_id ?? 100001,
            order: nextOrder,
          },
        ],
      },
    });
  };

  const updatePromptContent = (identifier: string, content: string) => {
    onChange({
      ...presetData,
      chatPreset: {
        ...chatPreset,
        prompts: chatPreset.prompts.map((p) =>
          p.identifier === identifier ? { ...p, content } : p,
        ),
      },
    });
  };

  const orderList = chatPreset.prompt_order[0]?.order ?? [];
  const promptMap = new Map(chatPreset.prompts.map((p) => [p.identifier, p]));

  return (
    <div className="space-y-6">
      {/* Auto-repair diagnostic log */}
      {repairIssues.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <Wrench className="h-4 w-4 text-amber-700" aria-hidden="true" />
            <span>已自動偵測並修復 {repairIssues.length} 項預設格式問題</span>
          </div>
          <ul className="mt-2.5 space-y-1.5 text-xs text-amber-900">
            {repairIssues.map((issue, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-semibold text-amber-800 whitespace-nowrap shrink-0">
                  [{REPAIR_KIND_LABELS[issue.kind] || '修復'}]
                </span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-xs font-medium text-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
          <span>此預設檔案符合 SillyTavern 標準結構，無須額外修復。</span>
        </div>
      )}

      {/* Sampling parameters */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">核心採樣與上下文參數</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              ['temperature', 'Temperature', '0.05'],
              ['top_p', 'Top P', '0.05'],
              ['top_k', 'Top K', '1'],
              ['min_p', 'Min P', '0.01'],
              ['repetition_penalty', 'Rep Penalty', '0.05'],
              ['frequency_penalty', 'Freq Penalty', '0.05'],
              ['presence_penalty', 'Pres Penalty', '0.05'],
              ['openai_max_context', 'Max Context', '1024'],
              ['openai_max_tokens', 'Max Tokens', '128'],
            ] as const
          ).map(([field, label, step]) => (
            <div key={field}>
              <label
                htmlFor={`preset-${field}`}
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                {label}
              </label>
              <input
                id={`preset-${field}`}
                type="number"
                step={step}
                value={Number(chatPreset[field] ?? 0)}
                onChange={(e) => updateNumberParam(field, e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Prompt Order & Entries */}
      <div className="border-t border-slate-200 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Prompt 提示詞編排與內容（{orderList.length} 段）
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">
            已啟用 {orderList.filter((o) => o.enabled).length} / {orderList.length}
          </span>
        </div>

        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {orderList.map((orderItem, idx) => {
            const entry = promptMap.get(orderItem.identifier);
            if (!entry) return null;
            return (
              <div key={entry.identifier} className="p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orderItem.enabled}
                      onChange={() => togglePromptEnabled(entry.identifier)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span className="text-sm font-medium text-slate-900">
                      {idx + 1}. {entry.name}
                    </span>
                  </label>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <span>{entry.role}</span>
                    <span aria-hidden="true">·</span>
                    <span>{entry.identifier}</span>
                    {entry.marker && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>系統佔位符</span>
                      </>
                    )}
                  </div>
                </div>

                {!entry.marker && (
                  <textarea
                    rows={2}
                    value={entry.content}
                    aria-label={`${entry.name} 提示詞內容`}
                    onChange={(e) => updatePromptContent(entry.identifier, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 leading-relaxed focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
