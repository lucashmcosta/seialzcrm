import { useState } from 'react';
import { PuzzlePiece, PushPin, PushPinSlash } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEnabledWidgets } from './useOrgWidgets';
import { useWidgetPins } from './useWidgetPins';
import { useWidgetWorkspace } from './workspace/WidgetWorkspaceContext';
import { useWidgetContextSource } from './workspace/useWidgetContextSource';
import type { WidgetContext, WidgetScreen } from './types';

interface Props {
  screen: Extract<WidgetScreen, 'commercial' | 'inbox'>;
  context: WidgetContext;
  size?: 'sm' | 'xs';
}

/** Lançador do Comercial/Atendimento: widgets globais ligados na org; pins por tela. Abre/foca janelas do Workspace global. */
export function WidgetsTrigger({ screen, context, size = 'sm' }: Props) {
  const ws = useWidgetWorkspace();
  const { widgets: defs } = useEnabledWidgets();
  const widgets = defs.map((def) => ({ def }));
  const { pins, togglePin } = useWidgetPins(screen);
  const [menuOpen, setMenuOpen] = useState(false);
  useWidgetContextSource(context);

  if (!ws || widgets.length === 0) return null;

  const pinned = widgets.filter((w) => pins.includes(w.def.key));
  const btn = size === 'xs' ? 'h-7 w-7 p-0' : 'h-8 w-8 p-0';
  const isOpen = (k: string) => ws.layout.windows[k]?.state === 'open';

  return (
    <>
      {pinned.map(({ def }) => {
        const Icon = def.icon;
        const active = isOpen(def.key);
        return (
          <Button key={def.key} variant={active ? 'secondary' : 'ghost'} size="sm" className={btn} title={def.name} aria-label={def.name}
            aria-pressed={active} data-widget-shortcut="pinned" onClick={() => ws.open(def.key)}>
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
                  onClick={() => { setMenuOpen(false); ws.open(def.key); }}>
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
    </>
  );
}
