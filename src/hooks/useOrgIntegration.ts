import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Resolve a linha `organization_integrations` de uma capability de forma ROBUSTA.
//
// Bug corrigido: a versão anterior fazia `.maybeSingle()` e retornava `data`
// DESCARTANDO o `error`. Num mount com o contexto de organização ainda não
// assentado (o usuário pode pertencer a >1 org), o filtro casava ≠1 linha →
// PostgREST 406 → `.maybeSingle()` devolvia `{data:null,error}` → o null era
// cacheado como "success" e sobrescrevia o `initialData` correto, sem nunca refazer.
// A aba dependente (Formulários / Pixel) ficava em branco.
//
// Aqui: `enabled` exige org E integration (nunca dispara com id indefinido); o
// filtro é sempre org+integration (1 linha determinística); `limit(1)` protege
// contra qualquer multiplicidade; e o erro é LANÇADO (react-query mostra estado de
// erro e retenta) em vez de virar um null silencioso.
export function useOrgIntegration(
  orgId?: string | null,
  integrationId?: string | null,
  initialData?: unknown,
) {
  return useQuery({
    queryKey: ["org-integration-v2", integrationId, orgId],
    enabled: !!orgId && !!integrationId,
    initialData: initialData as never,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_integrations")
        .select("*")
        .eq("organization_id", orgId!)
        .eq("integration_id", integrationId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
