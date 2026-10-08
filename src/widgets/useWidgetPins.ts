import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import type { WidgetScreen } from './types';

export function useWidgetPins(screen: WidgetScreen) {
  const { organization, userProfile } = useOrganization();
  const orgId = organization?.id;
  const userId = userProfile?.id;
  const qc = useQueryClient();
  const key = ['widget-pins', orgId, userId, screen];

  const { data: pins = [] } = useQuery({
    queryKey: key,
    enabled: !!orgId && !!userId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from('user_widget_preferences')
        .select('pinned_widget_keys')
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .eq('screen', screen)
        .maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.pinned_widget_keys) ? data.pinned_widget_keys : [];
    },
  });

  const mutation = useMutation({
    mutationFn: async (next: string[]) => {
      const { error } = await (supabase as any)
        .from('user_widget_preferences')
        .upsert(
          { organization_id: orgId, user_id: userId, screen, pinned_widget_keys: next },
          { onConflict: 'organization_id,user_id,screen' },
        );
      if (error) throw error;
    },
    onMutate: async (next) => {
      const prev = qc.getQueryData<string[]>(key);
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (_e, _n, ctx) => qc.setQueryData(key, ctx?.prev ?? []),
  });

  const togglePin = (widgetKey: string) => {
    const next = pins.includes(widgetKey) ? pins.filter((k) => k !== widgetKey) : [...pins, widgetKey];
    mutation.mutate(next);
  };

  return { pins, togglePin };
}
