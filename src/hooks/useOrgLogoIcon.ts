// Ícone do menu recolhido (organizations.logo_icon_url). Consulta separada e tolerante:
// se a coluna ainda não existir (migration pendente), retorna null sem quebrar o app.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const orgLogoIconKey = (orgId: string | undefined) => ['org-logo-icon', orgId];

export function useOrgLogoIcon(orgId: string | undefined) {
  return useQuery({
    queryKey: orgLogoIconKey(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.from('organizations') as any)
        .select('logo_icon_url')
        .eq('id', orgId)
        .maybeSingle();
      if (error) return null;
      return ((data as { logo_icon_url?: string | null } | null)?.logo_icon_url) || null;
    },
  });
}
