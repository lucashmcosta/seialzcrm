// Dispatcher único de envio WhatsApp (lado servidor).
//
// ÚNICO ponto autorizado a invocar `twilio-whatsapp-send` ou `meta-whatsapp-send`.
// Qualquer outro arquivo deve importar `dispatchWhatsAppSend` daqui.
//
// Resolução de provider:
//   1. Se `endpointId` for passado, consulta provider na tabela.
//   2. Senão, se `threadId` for passado, resolve via thread.primary_endpoint_id.
//   3. Caso contrário, mantém `twilio` (DEFAULT da coluna provider).

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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

export interface WhatsAppSendResult {
  data: any;
  error: { message: string; details?: any } | null;
}

async function resolveProvider(
  supabase: SupabaseClient,
  payload: WhatsAppSendPayload,
): Promise<"twilio" | "meta_cloud_api"> {
  // 1. endpointId explícito
  if (payload.endpointId) {
    const { data } = await supabase
      .from("communication_endpoints")
      .select("provider")
      .eq("id", payload.endpointId)
      .maybeSingle();
    if (data?.provider === "meta_cloud_api") return "meta_cloud_api";
    return "twilio";
  }
  // 2. threadId -> primary_endpoint_id -> provider
  if (payload.threadId) {
    const { data: thread } = await supabase
      .from("message_threads")
      .select("primary_endpoint_id")
      .eq("id", payload.threadId)
      .maybeSingle();
    if (thread?.primary_endpoint_id) {
      const { data: ep } = await supabase
        .from("communication_endpoints")
        .select("provider")
        .eq("id", thread.primary_endpoint_id)
        .maybeSingle();
      if (ep?.provider === "meta_cloud_api") return "meta_cloud_api";
    }
  }
  return "twilio";
}

export async function dispatchWhatsAppSend(
  payload: WhatsAppSendPayload,
  options?: { supabase?: SupabaseClient },
): Promise<WhatsAppSendResult> {
  const supabase = options?.supabase ?? createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const provider = await resolveProvider(supabase, payload);
  const fnName = provider === "meta_cloud_api"
    ? "meta-whatsapp-send"
    : "twilio-whatsapp-send";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { data: null, error: { message: json?.error || `HTTP ${res.status}`, details: json } };
    }
    return { data: json, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } };
  }
}
