// Feature flag: meta_multi_waba
// Controla visibilidade da UI "Adicionar WABA" (PR1-B).
// Só admins conseguem ler a tabela feature_flags — caller sem permissão vê `false`.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FLAG_NAME = "meta_multi_waba";

export function useMetaMultiWabaFlag(organizationId?: string) {
  const { data } = useQuery({
    queryKey: ["feature-flag", FLAG_NAME],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("is_enabled, organization_ids")
        .eq("name", FLAG_NAME)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  if (!data) return false;
  if (!data.is_enabled) return false;
  const orgs = (data.organization_ids ?? []) as string[];
  if (!orgs || orgs.length === 0) return true; // enabled globally
  return !!organizationId && orgs.includes(organizationId);
}
