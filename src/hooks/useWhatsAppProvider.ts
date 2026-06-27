// Resolve qual provider WhatsApp (twilio | meta_cloud_api) atende uma thread
// ou endpoint. Usado pelo composer para escolher quais templates listar.
//
// Default = null (caller deve tratar como Twilio para preservar comportamento legado).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Provider = "twilio" | "meta_cloud_api";

interface Args {
  threadId?: string | null;
  endpointId?: string | null;
}

export function useWhatsAppProvider({ threadId, endpointId }: Args): Provider | null {
  const { data } = useQuery({
    queryKey: ["whatsapp-provider", endpointId ?? null, threadId ?? null],
    enabled: !!(threadId || endpointId),
    staleTime: 60_000,
    queryFn: async (): Promise<Provider | null> => {
      if (endpointId) {
        const { data } = await supabase
          .from("communication_endpoints")
          .select("provider")
          .eq("id", endpointId)
          .maybeSingle();
        const p = (data as any)?.provider;
        return p === "meta_cloud_api" ? "meta_cloud_api" : p === "twilio" ? "twilio" : null;
      }
      if (threadId) {
        const { data: thread } = await supabase
          .from("message_threads")
          .select("primary_endpoint_id")
          .eq("id", threadId)
          .maybeSingle();
        const pid = (thread as any)?.primary_endpoint_id;
        if (!pid) return null;
        const { data: ep } = await supabase
          .from("communication_endpoints")
          .select("provider")
          .eq("id", pid)
          .maybeSingle();
        const p = (ep as any)?.provider;
        return p === "meta_cloud_api" ? "meta_cloud_api" : p === "twilio" ? "twilio" : null;
      }
      return null;
    },
  });
  return data ?? null;
}
