import { hardRefreshApp, useUpdateAvailable } from '@/hooks/useVersionCheck';
import { ArrowClockwise } from '@phosphor-icons/react';

export function UpdateBanner() {
  const available = useUpdateAvailable();
  if (!available) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[9999] bg-primary text-primary-foreground shadow-lg"
      style={{
        top: 0,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: 8,
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Nova versão disponível</span>
          <span className="text-xs opacity-90">Toque em atualizar para recarregar.</span>
        </div>
        <button
          type="button"
          onClick={() => void hardRefreshApp()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground/15 hover:bg-primary-foreground/25 px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <ArrowClockwise size={16} weight="bold" />
          Atualizar
        </button>
      </div>
    </div>
  );
}
