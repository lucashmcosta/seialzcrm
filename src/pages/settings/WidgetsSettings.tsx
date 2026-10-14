import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { WIDGET_REGISTRY } from '@/widgets/registry';
import { orgWidgetsKey, useOrgWidgetConfig } from '@/widgets/useOrgWidgets';

/** Só habilitação global por org. Config por tela/Modal/Drawer foi removida da interface (dados preservados). */
export default function WidgetsSettings() {
  const { permissions, loading } = usePermissions();
  const { data, orgId, isLoading } = useOrgWidgetConfig();
  const qc = useQueryClient();

  if (loading) return null;
  if (!permissions.canManageSettings) {
    return <p className="text-sm text-muted-foreground">Você não tem permissão para gerenciar widgets.</p>;
  }

  const setWidget = async (key: string, is_enabled: boolean) => {
    const { error } = await (supabase as any).from('organization_widgets')
      .upsert({ organization_id: orgId, widget_key: key, is_enabled }, { onConflict: 'organization_id,widget_key' });
    if (error) return toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
    qc.invalidateQueries({ queryKey: orgWidgetsKey(orgId) });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Widgets</h2>
        <p className="text-sm text-muted-foreground">
          Widgets ligados aparecem no menu Widgets e nos atalhos do Comercial e do Atendimento. Todo widget começa desligado.
        </p>
      </div>
      {isLoading ? null : WIDGET_REGISTRY.map((def) => {
        const Icon = def.icon;
        const enabled = !!data?.widgets.find((w) => w.widget_key === def.key)?.is_enabled;
        return (
          <div key={def.key} className="flex items-start gap-3 rounded-[6px] border border-border bg-card p-4">
            <Icon size={20} className="mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium text-foreground">{def.name}</div>
              <div className="text-sm text-muted-foreground">{def.description}</div>
            </div>
            <Switch aria-label={`Ativar ${def.name}`} checked={enabled} onCheckedChange={(v) => setWidget(def.key, v)} />
          </div>
        );
      })}
    </div>
  );
}
