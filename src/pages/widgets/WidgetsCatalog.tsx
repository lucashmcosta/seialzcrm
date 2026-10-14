import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { useEnabledWidgets } from '@/widgets/useOrgWidgets';
import { useWidgetWorkspace } from '@/widgets/workspace/WidgetWorkspaceContext';

/** Catálogo global. "Abrir" usa só o Workspace V2 (open = abre, restaura ou foca; uma instância por widget). */
export default function WidgetsCatalog() {
  const ws = useWidgetWorkspace();
  const { widgets, isLoading } = useEnabledWidgets();
  const { permissions } = usePermissions();

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Widgets</h1>
          <p className="text-sm text-muted-foreground">Ferramentas que abrem em janelas e acompanham você entre as telas.</p>
        </div>
        {!ws && (
          <p className="rounded-[6px] border border-border bg-muted p-3 text-sm text-muted-foreground">
            Widgets estão disponíveis no computador.
          </p>
        )}
        {isLoading ? null : widgets.length === 0 ? (
          <div className="rounded-[6px] border border-border bg-card p-6 text-sm text-muted-foreground">
            Nenhum widget ligado nesta organização.
            {permissions.canManageSettings && (
              <> <Link to="/settings/widgets" className="text-primary underline">Ligar em Configurações</Link>.</>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {widgets.map((def) => {
              const Icon = def.icon;
              const state = ws?.layout.windows[def.key]?.state;
              return (
                <div key={def.key} className="flex flex-col gap-3 rounded-[6px] border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-muted">
                      <Icon size={20} className="text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">{def.name}</div>
                      <div className="text-sm text-muted-foreground">{def.description}</div>
                    </div>
                  </div>
                  <Button size="sm" className="self-end" disabled={!ws} aria-label={`Abrir ${def.name}`}
                    onClick={() => ws?.open(def.key)}>
                    {state === 'open' ? 'Mostrar' : state === 'minimized' ? 'Restaurar' : 'Abrir'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
