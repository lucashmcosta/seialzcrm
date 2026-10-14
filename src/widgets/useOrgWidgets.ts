import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { WIDGET_REGISTRY } from './registry';
import type { WidgetDefinition } from './types';

export interface OrgWidgetRow { widget_key: string; is_enabled: boolean }

export interface OrgWidgetConfig {
  widgets: OrgWidgetRow[];
}

export const orgWidgetsKey = (orgId?: string) => ['org-widgets', orgId] as const;

/** Só habilitação global por org. organization_widget_screens ficou apenas por compatibilidade (não lida). */
export function useOrgWidgetConfig() {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const query = useQuery({
    queryKey: orgWidgetsKey(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OrgWidgetConfig> => {
      const { data, error } = await (supabase as any)
        .from('organization_widgets').select('widget_key,is_enabled').eq('organization_id', orgId);
      if (error) throw error;
      return { widgets: data ?? [] };
    },
  });

  // Realtime centralizado no WidgetWorkspaceProvider (um canal por org).
  return { ...query, orgId };
}

/** Registry ∩ ligado na org. Widgets são globais: não dependem de tela. Keys desconhecidas são ignoradas. */
export function resolveEnabledWidgets(config: OrgWidgetConfig | undefined): WidgetDefinition[] {
  if (!config) return [];
  const on = new Set(config.widgets.filter((w) => w.is_enabled).map((w) => w.widget_key));
  return WIDGET_REGISTRY.filter((def) => on.has(def.key));
}

export function useEnabledWidgets() {
  const { data, isLoading } = useOrgWidgetConfig();
  const widgets = useMemo(() => resolveEnabledWidgets(data), [data]);
  return { widgets, isLoading };
}
