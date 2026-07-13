// Resolve id de endpoint -> número (external_address), incluindo endpoints
// INATIVOS (números antigos/rotacionados). Usado para o divisor de
// "Número alterado" na timeline de /messages.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EndpointNumber {
  address: string | null;
  provider: string | null;
  isActive: boolean;
}

export function useEndpointNumbers(ids: string[]): Record<string, EndpointNumber> {
  const key = [...ids].sort().join(",");
  const { data } = useQuery({
    queryKey: ["endpoint-numbers", key],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("communication_endpoints")
        .select("id, external_address, provider, is_active")
        .in("id", ids);
      const map: Record<string, EndpointNumber> = {};
      (rows ?? []).forEach((r: any) => {
        map[r.id] = { address: r.external_address ?? null, provider: r.provider ?? null, isActive: !!r.is_active };
      });
      return map;
    },
  });
  return data ?? {};
}
