// Resolve o primary_endpoint_id de uma thread. Usado pelo composer/template
// selector para escopar templates Meta pela WABA correta do endpoint de envio.
//
// Default = null (caller trata como legado/Twilio, sem escopo de WABA).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useThreadEndpointId(threadId?: string | null): string | null {
  const { data } = useQuery({
    queryKey: ["thread-endpoint-id", threadId ?? null],
    enabled: !!threadId,
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data: thread } = await supabase
        .from("message_threads")
        .select("primary_endpoint_id")
        .eq("id", threadId as string)
        .maybeSingle();
      return ((thread as any)?.primary_endpoint_id as string | null) ?? null;
    },
  });
  return data ?? null;
}
