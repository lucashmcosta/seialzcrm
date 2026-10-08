import { useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useEffectiveWidgets } from './useOrgWidgets';
import { useWidgetPins } from './useWidgetPins';
import { usePinnedWidget } from './PinnedWidgetContext';
import type { WidgetScreen } from './types';

/** Painel lateral único, não modal, que participa do layout. */
export function PinnedWidgetPanel() {
  const state = usePinnedWidget();
  const screen = (state?.screen ?? 'commercial') as WidgetScreen;
  const { widgets } = useEffectiveWidgets(screen);
  const { pins } = useWidgetPins(screen);

  const active = state?.openKey
    ? widgets.find((w) => w.def.key === state.openKey && pins.includes(w.def.key)) ?? null
    : null;

  // Widget desligado/desafixado enquanto aberto: fecha.
  useEffect(() => {
    if (state?.openKey && !active && widgets.length >= 0 && pins) {
      // aguarda dados carregados: só fecha se config já resolveu
      if (widgets.length === 0 || !widgets.some((w) => w.def.key === state.openKey) || !pins.includes(state.openKey)) {
        state.close();
      }
    }
  }, [state, active, widgets, pins]);

  if (!state || !active || !state.context) return null;
  const Body = active.def.Component;
  const Icon = active.def.icon;

  return (
    <aside
      className="w-[360px] flex-shrink-0 h-full border-l border-border bg-card flex flex-col overflow-hidden"
      data-widget-host="pinned-panel"
      aria-label={active.def.name}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon size={16} />
        <span className="text-sm font-semibold truncate flex-1">{active.def.name}</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Fechar" aria-label="Fechar painel" onClick={state.close}>
          <X size={14} />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <Body context={state.context} />
      </div>
    </aside>
  );
}
