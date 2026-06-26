// Dispatcher único de envio WhatsApp (lado cliente).
//
// ÚNICO ponto autorizado a invocar `twilio-whatsapp-send` ou `meta-whatsapp-send`.
// Qualquer outro componente deve importar `dispatchWhatsAppSend` daqui.
// Há regra ESLint (eslint.config.js) que bloqueia invokes diretos fora deste arquivo.

import { supabase } from "@/integrations/supabase/client";

export interface WhatsAppSendPayload {
  organizationId: string;
  contactId?: string;
  threadId?: string;
  message?: string;
  templateId?: string;
  templateVariables?: Record<string, string | number>;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaType?: string;
  userId?: string;
  replyToMessageId?: string;
  isAgentMessage?: boolean;
  agentId?: string;
  senderName?: string;
  senderContext?: "inbox" | "messages" | string;
  dryRun?: boolean;
  endpointId?: string;
}

type Provider = "twilio" | "meta_cloud_api";

async function resolveProvider(payload: WhatsAppSendPayload): Promise<Provider> {
  if (payload.endpointId) {
    const { data } = await supabase
      .from("communication_endpoints")
      .select("provider")
      .eq("id", payload.endpointId)
      .maybeSingle();
    if ((data as any)?.provider === "meta_cloud_api") return "meta_cloud_api";
    return "twilio";
  }
  if (payload.threadId) {
    const { data: thread } = await supabase
      .from("message_threads")
      .select("primary_endpoint_id")
      .eq("id", payload.threadId)
      .maybeSingle();
    const pid = (thread as any)?.primary_endpoint_id;
    if (pid) {
      const { data: ep } = await supabase
        .from("communication_endpoints")
        .select("provider")
        .eq("id", pid)
        .maybeSingle();
      if ((ep as any)?.provider === "meta_cloud_api") return "meta_cloud_api";
    }
  }
  return "twilio";
}

/**
 * Envia mensagem WhatsApp pelo provider correto (Twilio ou Meta Cloud).
 * Retorna o mesmo shape de `supabase.functions.invoke(...)`: `{ data, error }`.
 */
export async function dispatchWhatsAppSend(payload: WhatsAppSendPayload) {
  const provider = await resolveProvider(payload);
  const fnName = provider === "meta_cloud_api" ? "meta-whatsapp-send" : "twilio-whatsapp-send";
  // eslint-disable-next-line no-restricted-syntax
  return await supabase.functions.invoke(fnName, { body: payload });
}
