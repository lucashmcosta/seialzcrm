// Resolve qual provider WhatsApp (twilio | meta_cloud_api | evolution_api)
// atende uma thread ou endpoint. Usado pelo composer para escolher quais
// templates listar e para exibir capacidades específicas do provider.
//
// Default = null (caller deve tratar como Twilio para preservar comportamento legado).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Provider = "twilio" | "meta_cloud_api" | "evolution_api";

function normalize(p: unknown): Provider | null {
  if (p === "meta_cloud_api") return "meta_cloud_api";
  if (p === "evolution_api") return "evolution_api";
  if (p === "twilio") return "twilio";
  return null;
}

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
        return normalize((data as any)?.provider);
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
        return normalize((ep as any)?.provider);
      }
      return null;
    },
  });
  return data ?? null;
}
