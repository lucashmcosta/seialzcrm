import { useEffect, useState } from 'react';
import { PuzzlePiece, PushPin, PushPinSlash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEffectiveWidgets, type EffectiveWidget } from './useOrgWidgets';
import { useWidgetPins } from './useWidgetPins';
import { WidgetHost } from './WidgetHost';
import { usePinnedWidget } from './PinnedWidgetContext';
import type { WidgetContext, WidgetScreen } from './types';

interface Props {
  screen: Extract<WidgetScreen, 'commercial' | 'inbox'>;
  context: WidgetContext;
  size?: 'sm' | 'xs';
}

export function WidgetsTrigger({ screen, context, size = 'sm' }: Props) {
  const { widgets } = useEffectiveWidgets(screen);
  const { pins, togglePin } = useWidgetPins(screen);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const panel = usePinnedWidget();

  const active: EffectiveWidget | null = widgets.find((w) => w.def.key === openKey) ?? null;

  // Widget desligado enquanto aberto: fecha imediatamente.
  useEffect(() => {
    if (openKey && !active) setOpenKey(null);
  }, [openKey, active]);

  // Mantém o painel fixado com o contexto da conversa atual.
  const setPanelContext = panel?.setContext;
  useEffect(() => {
    setPanelContext?.(context);
  }, [setPanelContext, context]);

  if (widgets.length === 0) return null;

  // Pins de widgets desligados/desconhecidos são ignorados.
  const pinned = widgets.filter((w) => pins.includes(w.def.key));
  const btn = size === 'xs' ? 'h-7 w-7 p-0' : 'h-8 w-8 p-0';

  return (
    <>
      {/* Atalho fixado depende exclusivamente do PinnedWidgetPanel: nunca abre WidgetHost. */}
      {panel && pinned.map(({ def }) => {
        const Icon = def.icon;
        const isOpen = panel.openKey === def.key;
        return (
          <Button key={def.key} variant={isOpen ? 'secondary' : 'ghost'} size="sm" className={btn} title={def.name} aria-label={def.name}
            aria-pressed={isOpen} data-widget-shortcut="pinned"
            onClick={() => panel.toggle(def.key)}>
            <Icon size={16} weight="bold" />
          </Button>
        );
      })}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={btn} title="Widgets" aria-label="Widgets">
            <PuzzlePiece size={16} weight="bold" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Widgets</div>
          {widgets.map(({ def }) => {
            const Icon = def.icon;
            const isPinned = pins.includes(def.key);
            return (
              <div key={def.key} className="flex items-center gap-1 rounded-[6px] hover:bg-muted">
                <button type="button" className="flex flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                  onClick={() => { setMenuOpen(false); setOpenKey(def.key); }}>
                  <Icon size={16} />
                  <span className="truncate">{def.name}</span>
                </button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                  title={isPinned ? 'Desafixar' : 'Fixar'} aria-label={isPinned ? `Desafixar ${def.name}` : `Fixar ${def.name}`}
                  onClick={() => togglePin(def.key)}>
                  {isPinned ? <PushPinSlash size={14} /> : <PushPin size={14} />}
                </Button>
              </div>
            );
          })}
        </PopoverContent>
      </Popover>
      <WidgetHost widget={active} context={context} onClose={() => setOpenKey(null)} />
    </>
  );
}
