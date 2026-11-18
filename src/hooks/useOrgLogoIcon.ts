// Ícone do menu recolhido (organizations.logo_icon_url). Consulta separada e tolerante:
// se a coluna ainda não existir (migration pendente), retorna null sem quebrar o app.
// Guarda o último ícone no navegador para aparecer na hora ao recarregar (sem "piscar" outro ícone).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const orgLogoIconKey = (orgId: string | undefined) => ['org-logo-icon', orgId];
const cacheKey = (orgId: string) => `org-logo-icon:${orgId}`;

function readCache(orgId: string | undefined): string | null | undefined {
  if (!orgId) return undefined;
  try {
    const v = window.localStorage.getItem(cacheKey(orgId));
    if (v === null) return undefined; // nunca visto: deixa a consulta decidir
    return v === '' ? null : v;
  } catch { return undefined; }
}

function writeCache(orgId: string, value: string | null) {
  try { window.localStorage.setItem(cacheKey(orgId), value ?? ''); } catch { /* storage indisponível */ }
}

export function useOrgLogoIcon(orgId: string | undefined) {
  const cached = readCache(orgId);
  return useQuery({
    queryKey: orgLogoIconKey(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    retry: false,
    // Com cache, mostra na hora e confere no servidor em segundo plano.
    ...(cached !== undefined ? { initialData: cached, initialDataUpdatedAt: 0 } : {}),
    queryFn: async () => {
      const { data, error } = await (supabase.from('organizations') as any)
        .select('logo_icon_url')
        .eq('id', orgId)
        .maybeSingle();
      if (error) return null;
      const url = ((data as { logo_icon_url?: string | null } | null)?.logo_icon_url) || null;
      if (orgId) writeCache(orgId, url);
      return url;
    },
  });
}
