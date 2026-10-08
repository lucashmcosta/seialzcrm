import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { WIDGET_REGISTRY } from '@/widgets/registry';
import { orgWidgetsKey, useOrgWidgetConfig } from '@/widgets/useOrgWidgets';
import { ACTIVE_SCREENS, SCREEN_LABELS, type WidgetDefinition, type WidgetOpenMode, type WidgetScreen } from '@/widgets/types';

export default function WidgetsSettings() {
  const { permissions, loading } = usePermissions();
  const { data, orgId, isLoading } = useOrgWidgetConfig();
  const qc = useQueryClient();
  const db = supabase as any;

  if (loading) return null;
  if (!permissions.canManageSettings) {
    return <p className="text-sm text-muted-foreground">Você não tem permissão para gerenciar widgets.</p>;
  }

  const refresh = () => qc.invalidateQueries({ queryKey: orgWidgetsKey(orgId) });
  const fail = (e: any) => toast({ title: 'Não foi possível salvar', description: e?.message, variant: 'destructive' });

  const setWidget = async (key: string, is_enabled: boolean) => {
    const { error } = await db.from('organization_widgets')
      .upsert({ organization_id: orgId, widget_key: key, is_enabled }, { onConflict: 'organization_id,widget_key' });
    if (error) return fail(error);
    refresh();
  };

  const setScreen = async (def: WidgetDefinition, screen: WidgetScreen, patch: { is_enabled?: boolean; open_mode?: WidgetOpenMode }) => {
    const current = data?.screens.find((s) => s.widget_key === def.key && s.screen === screen);
    const row = {
      organization_id: orgId, widget_key: def.key, screen,
      is_enabled: patch.is_enabled ?? current?.is_enabled ?? false,
      open_mode: patch.open_mode ?? (current?.open_mode as WidgetOpenMode) ?? def.defaultOpenMode,
    };
    if (!data?.widgets.some((w) => w.widget_key === def.key)) {
      const { error } = await db.from('organization_widgets')
        .upsert({ organization_id: orgId, widget_key: def.key, is_enabled: false }, { onConflict: 'organization_id,widget_key' });
      if (error) return fail(error);
    }
    const { error } = await db.from('organization_widget_screens').upsert(row, { onConflict: 'organization_id,widget_key,screen' });
    if (error) return fail(error);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Widgets</h2>
        <p className="text-sm text-muted-foreground">Ferramentas que a equipe abre dentro das conversas. Todo widget começa desligado.</p>
      </div>
      {isLoading ? null : WIDGET_REGISTRY.map((def) => {
        const Icon = def.icon;
        const enabled = !!data?.widgets.find((w) => w.widget_key === def.key)?.is_enabled;
        return (
          <div key={def.key} className="rounded-[6px] border border-border bg-card p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Icon size={20} className="mt-0.5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium text-foreground">{def.name}</div>
                <div className="text-sm text-muted-foreground">{def.description}</div>
              </div>
              <Switch aria-label={`Ativar ${def.name}`} checked={enabled} onCheckedChange={(v) => setWidget(def.key, v)} />
            </div>
            <div className="divide-y divide-border border-t border-border">
              {def.screens.filter((s) => ACTIVE_SCREENS.includes(s)).map((screen) => {
                const row = data?.screens.find((s) => s.widget_key === def.key && s.screen === screen);
                const mode = (row?.open_mode as WidgetOpenMode) ?? def.defaultOpenMode;
                return (
                  <div key={screen} className={`flex items-center gap-3 py-3 ${enabled ? '' : 'opacity-50'}`}>
                    <span className="flex-1 text-sm text-foreground">{SCREEN_LABELS[screen]}</span>
                    <div className="flex gap-1">
                      {def.openModes.map((m) => (
                        <Button key={m} size="sm" variant={mode === m ? 'default' : 'outline'} disabled={!enabled}
                          onClick={() => setScreen(def, screen, { open_mode: m })}>
                          {m === 'modal' ? 'Modal' : 'Drawer'}
                        </Button>
                      ))}
                    </div>
                    <Switch aria-label={`${def.name} em ${SCREEN_LABELS[screen]}`} disabled={!enabled} checked={!!row?.is_enabled}
                      onCheckedChange={(v) => setScreen(def, screen, { is_enabled: v })} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
