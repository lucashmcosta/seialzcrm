import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDayIso } from './inboxScope';

export interface InboxAgentStats {
  handled: number;
  escalated: number;
  urgent: number;
  by_area: Record<string, number>;
  target_pct: number;
}

/** Números do agente de atendimento de hoje (fuso da org): atendidas, passadas e meta. */
export function useInboxAgentStats(organizationId: string | null, orgTimezone: string | null) {
  return useQuery({
    queryKey: ['inbox-agent-stats', organizationId, orgTimezone],
    enabled: !!organizationId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<InboxAgentStats | null> => {
      const { data, error } = await supabase.rpc('rpc_inbox_agent_stats' as never, {
        p_organization_id: organizationId,
        p_since: startOfDayIso(orgTimezone),
      } as never);
      if (error) return null;
      return (data ?? null) as InboxAgentStats | null;
    },
  });
}
