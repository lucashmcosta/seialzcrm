import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** A org tem chave para os botões de texto com IA (a estrelinha do campo de mensagem). */
export function useHasTextAi(organizationId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['org-has-text-ai', organizationId],
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc('rpc_org_has_text_ai' as never, { p_org: organizationId } as never);
      if (error) throw error;
      return result === true;
    },
  });
  return data === true;
}
