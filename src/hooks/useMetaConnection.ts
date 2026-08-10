import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Espelha, no frontend, a decisão de credencial da org: a credencial canônica só
// está ativa quando a flag `meta_canonical_credential` está ligada para a PRÓPRIA
// org E existe uma Meta Connection **conectada e saudável** para ela. Enquanto
// qualquer condição faltar (flag OFF, sem conexão, ou conexão em estado de saúde
// ruim), a UI continua no caminho legado — idêntico ao de hoje, sem regressão para
// orgs não migradas. Aditivo e reversível pela flag. Tudo escopado por organization_id
// (multi-tenant; sem hardcode de org/conexão).
export interface MetaConnectionInfo {
  id: string;
  status: string;
  token_type: string | null;
  authorizing_meta_user_name: string | null;
  granted_scopes: string[] | null;
  last_health: string | null;
  last_token_check_at: string | null;
}

export interface MetaConnectionState {
  connection: MetaConnectionInfo | null;
  flagOn: boolean;
  /** Conexão da org conectada e sem estado de saúde ruim (expired/error). */
  healthy: boolean;
  /** flagOn && conexão conectada e saudável. Fonte única do "modo canônico" da UI. */
  canonicalActive: boolean;
  isLoading: boolean;
}

const CANONICAL_FLAG = "meta_canonical_credential";

export function useMetaConnection(orgId?: string | null): MetaConnectionState {
  const { data, isLoading } = useQuery({
    queryKey: ["meta-connection-state", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [connRes, flagRes] = await Promise.all([
        supabase
          .from("meta_connections")
          .select(
            "id,status,token_type,authorizing_meta_user_name,granted_scopes,last_health,last_token_check_at",
          )
          .eq("organization_id", orgId!)
          .eq("status", "connected")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // RPC SECURITY DEFINER, exposta a `authenticated`: mesma fonte de verdade do backend.
        supabase.rpc("fn_feature_flag_enabled", {
          _flag_key: CANONICAL_FLAG,
          _organization_id: orgId!,
        }),
      ]);

      const connection = (connRes.data as MetaConnectionInfo | null) ?? null;
      const flagOn = flagRes.data === true;
      return { connection, flagOn };
    },
  });

  const connection = data?.connection ?? null;
  const flagOn = data?.flagOn ?? false;
  // A query já filtra status='connected'; consideramos saudável salvo estado de saúde
  // explicitamente ruim (expired/error). Conexão ausente => não saudável => legado.
  const healthy =
    !!connection &&
    connection.status === "connected" &&
    connection.last_health !== "expired" &&
    connection.last_health !== "error";
  const canonicalActive = flagOn && healthy;

  return { connection, flagOn, healthy, canonicalActive, isLoading };
}
