import { Link } from 'react-router-dom';
import { PuzzlePiece } from '@phosphor-icons/react';
import { Layout } from '@/components/Layout';
import { usePermissions } from '@/hooks/usePermissions';
import { useEnabledWidgets } from '@/widgets/useOrgWidgets';
import { useWidgetWorkspace } from '@/widgets/workspace/WidgetWorkspaceContext';
import { WidgetGalleryCard } from './WidgetGalleryCard';

/** Galeria global. Clique chama só `ws.open` (abre/restaura/foca; uma instância por widget). */
export default function WidgetsCatalog() {
  const ws = useWidgetWorkspace();
  const { widgets, isLoading } = useEnabledWidgets();
  const { permissions } = usePermissions();
  const openCount = widgets.filter((d) => ws?.layout.windows[d.key]?.state === 'open').length;

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Widgets</h1>
            <p className="text-sm text-muted-foreground">Ferramentas que abrem em janelas e acompanham você entre as telas.</p>
          </div>
          {widgets.length > 0 && (
            <span className="font-data text-[11px] uppercase tracking-wider text-muted-foreground">
              {widgets.length} {widgets.length === 1 ? 'disponível' : 'disponíveis'}
              {openCount > 0 && ` · ${openCount} ${openCount === 1 ? 'aberto' : 'abertos'}`}
            </span>
          )}
        </div>

        {!ws && (
          <p className="rounded-[6px] border border-border bg-muted p-3 text-sm text-muted-foreground">
            Widgets estão disponíveis no computador.
          </p>
        )}

        {isLoading ? null : widgets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[6px] border border-dashed border-border bg-card p-10 text-center">
            <PuzzlePiece size={40} weight="light" className="text-muted-foreground opacity-60" />
            <p className="text-sm text-muted-foreground">
              Nenhum widget ligado nesta organização.
              {permissions.canManageSettings && (
                <> <Link to="/settings/widgets" className="text-primary underline">Ligar em Configurações</Link>.</>
              )}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))]">
            {widgets.map((def, i) => (
              <WidgetGalleryCard key={def.key} def={def} index={i} disabled={!ws}
                state={ws?.layout.windows[def.key]?.state} onOpen={() => ws?.open(def.key)} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
