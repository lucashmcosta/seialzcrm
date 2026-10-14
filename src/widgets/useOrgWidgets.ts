import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { WIDGET_REGISTRY } from './registry';
import type { WidgetDefinition, WidgetOpenMode, WidgetScreen } from './types';

export interface OrgWidgetRow { widget_key: string; is_enabled: boolean }
export interface OrgWidgetScreenRow { widget_key: string; screen: string; is_enabled: boolean; open_mode: string }

export interface OrgWidgetConfig {
  widgets: OrgWidgetRow[];
  screens: OrgWidgetScreenRow[];
}

export const orgWidgetsKey = (orgId?: string) => ['org-widgets', orgId] as const;

export function useOrgWidgetConfig() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const query = useQuery({
    queryKey: orgWidgetsKey(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OrgWidgetConfig> => {
      const db = supabase as any;
      const [w, s] = await Promise.all([
        db.from('organization_widgets').select('widget_key,is_enabled').eq('organization_id', orgId),
        db.from('organization_widget_screens').select('widget_key,screen,is_enabled,open_mode').eq('organization_id', orgId),
      ]);
      if (w.error) throw w.error;
      if (s.error) throw s.error;
      return { widgets: w.data ?? [], screens: s.data ?? [] };
    },
  });

  // Realtime centralizado no WidgetWorkspaceProvider (um canal por org).
  return { ...query, orgId };
}

export interface EffectiveWidget { def: WidgetDefinition; openMode: WidgetOpenMode }

/** Registry ∩ widget ligado ∩ tela ligada ∩ tela suportada. Keys desconhecidas são ignoradas. */
export function resolveEffectiveWidgets(config: OrgWidgetConfig | undefined, screen: WidgetScreen): EffectiveWidget[] {
  if (!config) return [];
  const on = new Set(config.widgets.filter((w) => w.is_enabled).map((w) => w.widget_key));
  const out: EffectiveWidget[] = [];
  for (const def of WIDGET_REGISTRY) {
    if (!on.has(def.key) || !def.screens.includes(screen)) continue;
    const row = config.screens.find((s) => s.widget_key === def.key && s.screen === screen);
    if (!row?.is_enabled) continue;
    const mode = (def.openModes as string[]).includes(row.open_mode) ? (row.open_mode as WidgetOpenMode) : def.defaultOpenMode;
    out.push({ def, openMode: mode });
  }
  return out;
}

export function useEffectiveWidgets(screen: WidgetScreen) {
  const { data, isLoading } = useOrgWidgetConfig();
  const widgets = useMemo(() => resolveEffectiveWidgets(data, screen), [data, screen]);
  return { widgets, isLoading };
}
