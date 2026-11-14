import { Upload } from 'lucide-react';

export type ActiveNavView = 'workspace' | 'matrix' | 'privacy';

interface TopBarProps {
  activeView: ActiveNavView;
  onChangeView: (view: ActiveNavView) => void;
  onTriggerUpload: () => void;
}

export function TopBar({ activeView, onChangeView, onTriggerUpload }: TopBarProps) {
  const navItems: { id: ActiveNavView; label: string }[] = [
    { id: 'workspace', label: '轉換工作台' },
    { id: 'matrix', label: '支援格式表' },
    { id: 'privacy', label: '離線隱私' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => onChangeView('workspace')}
          className="text-left text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          TavernFormat
        </button>

        <nav aria-label="主要導覽" className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeView(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'border-blue-600 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onTriggerUpload}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>匯入檔案</span>
          </button>
        </div>
      </div>

      {/* Compact mobile nav row */}
      <nav
        aria-label="行動裝置導覽"
        className="flex md:hidden items-center gap-4 border-t border-slate-100 px-4 py-2 text-xs font-medium overflow-x-auto"
      >
        {navItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 ${
                active
                  ? 'border-blue-600 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
