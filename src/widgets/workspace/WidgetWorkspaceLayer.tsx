import { Rnd } from 'react-rnd';
import { Minus, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { getWidget } from '../registry';
import { useWidgetWorkspace } from './WidgetWorkspaceContext';
import { MIN_H, MIN_W } from './layout';
import type { WidgetContext, WidgetDefinition } from '../types';

/** Camada global: não intercepta cliques; só as janelas recebem eventos. Sem backdrop. */
export function WidgetWorkspaceLayer() {
  const ws = useWidgetWorkspace();
  if (!ws) return null;
  const entries = Object.entries(ws.layout.windows).filter(([k]) => ws.enabledKeys.has(k) && getWidget(k));
  const open = entries.filter(([, w]) => w.state === 'open');
  const minimized = entries.filter(([, w]) => w.state === 'minimized');

  return (
    <div className="fixed inset-0 z-40 pointer-events-none" data-widget-workspace="layer">
      {open.map(([key, w]) => {
        const def = getWidget(key)!;
        return (
          <Rnd
            key={key}
            className="pointer-events-auto"
            style={{ zIndex: w.z }}
            position={{ x: w.x, y: w.y }}
            size={{ width: w.w, height: w.h }}
            minWidth={MIN_W}
            minHeight={MIN_H}
            maxWidth="90vw"
            maxHeight="90vh"
            dragHandleClassName="widget-drag-handle"
            cancel=".widget-no-drag"
            onMouseDown={() => ws.focus(key)}
            onDragStop={(_e, d) => ws.commitGeometry(key, { x: d.x, y: d.y })}
            onResizeStop={(_e, _dir, ref, _delta, pos) =>
              ws.commitGeometry(key, { w: ref.offsetWidth, h: ref.offsetHeight, x: pos.x, y: pos.y })}
          >
            <WidgetWindow def={def} widgetKey={key} />
          </Rnd>
        );
      })}

      {minimized.length > 0 && (
        <div className="pointer-events-auto absolute bottom-4 right-4 flex gap-2" data-widget-workspace="dock">
          {minimized.map(([key]) => {
            const def = getWidget(key)!;
            const Icon = def.icon;
            return (
              <Button key={key} variant="secondary" size="sm" className="h-8 gap-2 shadow-md border border-border"
                title={`Restaurar ${def.name}`} onClick={() => ws.open(key)}>
                <Icon size={14} />
                <span className="max-w-[160px] truncate text-xs">{def.name}</span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WidgetWindow({ def, widgetKey }: { def: WidgetDefinition; widgetKey: string }) {
  const ws = useWidgetWorkspace()!;
  const Icon = def.icon;
  const Body = def.Component;
  const ctx = resolveContext(def, ws.context, ws.organizationId);

  return (
    <div className="h-full w-full flex flex-col rounded-[6px] border border-border bg-card text-card-foreground shadow-xl overflow-hidden"
      role="dialog" aria-modal="false" aria-label={def.name} data-widget-window={widgetKey}>
      <div className="widget-drag-handle flex items-center gap-2 px-3 py-2 border-b border-border cursor-move select-none">
        <Icon size={14} />
        <span className="text-sm font-semibold truncate flex-1">{def.name}</span>
        <div className="widget-no-drag flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Minimizar" title="Minimizar" onClick={() => ws.minimize(widgetKey)}>
            <Minus size={14} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Fechar" title="Fechar" onClick={() => ws.close(widgetKey)}>
            <X size={14} />
          </Button>
        </div>
      </div>
      <div className="widget-no-drag flex-1 overflow-y-auto p-4">
        {ctx.kind === 'empty' ? (
          <p className="text-sm text-muted-foreground">{ctx.message}</p>
        ) : (
          // key por entidade: trocar de contato/conversa remonta o corpo (sem dado antigo).
          <Body key={ctx.key} context={ctx.value} />
        )}
      </div>
    </div>
  );
}

const EMPTY_MESSAGE: Record<Exclude<WidgetDefinition['contextMode'], 'none' | undefined>, string> = {
  contact: 'Selecione um contato para usar este widget.',
  thread: 'Selecione uma conversa para usar este widget.',
  opportunity: 'Abra uma oportunidade para usar este widget.',
};

type Resolved = { kind: 'ok'; value: WidgetContext; key: string } | { kind: 'empty'; message: string };

function resolveContext(def: WidgetDefinition, ctx: WidgetContext | null, orgId: string): Resolved {
  const mode = def.contextMode ?? 'none';
  const safe = ctx && ctx.organizationId === orgId ? ctx : null;
  if (mode === 'none') {
    return { kind: 'ok', value: safe ?? { screen: 'commercial', organizationId: orgId, threadId: null, contactId: null }, key: 'static' };
  }
  const id = safe && mode === 'contact' && 'contactId' in safe ? safe.contactId
    : safe && mode === 'thread' && 'threadId' in safe ? safe.threadId
    : safe && mode === 'opportunity' && 'opportunityId' in safe ? safe.opportunityId : null;
  if (!safe || !id) return { kind: 'empty', message: EMPTY_MESSAGE[mode] };
  return { kind: 'ok', value: safe, key: `${mode}:${id}` };
}
