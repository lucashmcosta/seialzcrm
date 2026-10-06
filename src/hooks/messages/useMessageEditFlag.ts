// Resolução ÚNICA da flag `evolution_message_edit_v1`, usada igualmente em
// Comercial (Messages) e Atendimento (Inbox). Mesma regra do servidor
// (fn_feature_flag_enabled): flag ligada + org no escopo (lista vazia = global).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MESSAGE_EDIT_FLAG } from '@/lib/messageEdit';

export function useMessageEditFlag(organizationId?: string | null): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', MESSAGE_EDIT_FLAG, organizationId ?? null],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('is_enabled, organization_ids')
        .eq('name', MESSAGE_EDIT_FLAG)
        .maybeSingle();
      if (!data || data.is_enabled !== true) return false;
      const orgs = (data.organization_ids ?? []) as string[];
      return orgs.length === 0 || orgs.includes(organizationId as string);
    },
  });
  return data === true;
}
