// Envia mensagem WhatsApp via Meta Cloud API.
// Shape de entrada/saída compatível com twilio-whatsapp-send para uso pelo dispatcher.
// MVP: apenas texto + reply opcional dentro da janela 24h. Templates/mídia ficam fora.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { metaWaPostJson, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse(400, { error: "invalid_json" });

    const {
      organizationId, contactId, threadId, message,
      userId, replyToMessageId, isAgentMessage, agentId, senderName,
      endpointId: explicitEndpointId,
    } = body as Record<string, any>;

    if (!organizationId) return jsonResponse(400, { error: "missing_organization" });
    if (!contactId) return jsonResponse(400, { error: "missing_contact" });
    if (!message || typeof message !== "string") {
      return jsonResponse(400, { error: "missing_message", details: "MVP só suporta texto." });
    }
    if (message.length > 4096) {
      return jsonResponse(400, { error: "message_too_long", max: 4096 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve endpoint (provider='meta-cloud')
    let endpoint: any = null;
    if (explicitEndpointId) {
      const { data } = await supabase
        .from("communication_endpoints")
        .select("id, organization_id, organization_integration_id, sender_sid, external_address, provider, is_active")
        .eq("id", explicitEndpointId)
        .maybeSingle();
      endpoint = data;
    } else if (threadId) {
      const { data: thread } = await supabase
        .from("message_threads")
        .select("primary_endpoint_id")
        .eq("id", threadId)
        .maybeSingle();
      if (thread?.primary_endpoint_id) {
        const { data: ep } = await supabase
          .from("communication_endpoints")
          .select("id, organization_id, organization_integration_id, sender_sid, external_address, provider, is_active")
          .eq("id", thread.primary_endpoint_id)
          .maybeSingle();
        endpoint = ep;
      }
    }
    if (!endpoint) {
      // Fallback: primeiro endpoint meta-cloud ativo da org
      const { data } = await supabase
        .from("communication_endpoints")
        .select("id, organization_id, organization_integration_id, sender_sid, external_address, provider, is_active")
        .eq("organization_id", organizationId)
        .eq("provider", "meta_cloud_api")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      endpoint = data;
    }
    if (!endpoint) return jsonResponse(400, { error: "no_meta_cloud_endpoint" });
    if (endpoint.organization_id !== organizationId) {
      return jsonResponse(403, { error: "endpoint_org_mismatch" });
    }
    if (endpoint.provider !== "meta_cloud_api") {
      return jsonResponse(400, { error: "endpoint_not_meta_cloud" });
    }
    if (!endpoint.sender_sid) return jsonResponse(400, { error: "missing_phone_number_id" });

    // Busca integration credentials
    const { data: oi } = await supabase
      .from("organization_integrations")
      .select("connected_account, config_values")
      .eq("id", endpoint.organization_integration_id)
      .maybeSingle();
    if (!oi) return jsonResponse(400, { error: "integration_not_found" });
    const ca = oi.connected_account as any;
    if (!ca?.access_token_encrypted) return jsonResponse(400, { error: "missing_access_token" });

    const decryptedAccessToken = await decryptSecret(ca.access_token_encrypted);
    const rawAppSecret = Deno.env.get("META_WHATSAPP_APP_SECRET") ?? undefined;
    const accessToken = decryptedAccessToken.trim();
    const appSecret = rawAppSecret?.trim();

    // Contato + telefone
    const { data: contact } = await supabase
      .from("contacts")
      .select("phone, full_name")
      .eq("id", contactId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!contact?.phone) return jsonResponse(404, { error: "contact_phone_missing" });

    // Formato E.164 sem '+'
    let to = String(contact.phone).replace(/[^\d+]/g, "");
    if (to.startsWith("+")) to = to.slice(1);
    if (!/^\d{8,15}$/.test(to)) return jsonResponse(400, { error: "invalid_contact_phone" });

    // Janela 24h
    let currentThreadId = threadId as string | undefined;
    let in24h = false;
    if (currentThreadId) {
      const { data: t } = await supabase
        .from("message_threads")
        .select("whatsapp_last_inbound_at")
        .eq("id", currentThreadId)
        .maybeSingle();
      if (t?.whatsapp_last_inbound_at) {
        in24h = (Date.now() - new Date(t.whatsapp_last_inbound_at).getTime()) / 3.6e6 < 24;
      }
    } else {
      const { data: existing } = await supabase
        .from("message_threads")
        .select("id, whatsapp_last_inbound_at")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .eq("channel", "whatsapp")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        currentThreadId = existing.id;
        if (existing.whatsapp_last_inbound_at) {
          in24h = (Date.now() - new Date(existing.whatsapp_last_inbound_at).getTime()) / 3.6e6 < 24;
        }
      } else {
        const { data: created, error: tErr } = await supabase
          .from("message_threads")
          .insert({
            organization_id: organizationId,
            contact_id: contactId,
            channel: "whatsapp",
            subject: "WhatsApp",
            primary_endpoint_id: endpoint.id,
          })
          .select("id")
          .single();
        if (tErr || !created) return jsonResponse(500, { error: "thread_create_failed", details: tErr?.message });
        currentThreadId = created.id;
      }
    }

    // MVP: fora da janela 24h sem template = bloqueia
    if (!in24h) {
      return jsonResponse(400, {
        error: "outside_24h_window",
        requiresTemplate: true,
        isIn24hWindow: false,
        message: "MVP Meta Cloud aceita apenas texto dentro da janela 24h.",
      });
    }

    // Insere mensagem com status sending
    let resolvedSenderName = senderName || null;
    if (!resolvedSenderName && userId && !isAgentMessage) {
      const { data: u } = await supabase.from("users").select("full_name").eq("id", userId).maybeSingle();
      resolvedSenderName = u?.full_name || null;
    }

    const { data: insertedMsg, error: insErr } = await supabase
      .from("messages")
      .insert({
        organization_id: organizationId,
        thread_id: currentThreadId,
        content: message,
        direction: "outbound",
        sender_user_id: userId || null,
        whatsapp_status: "sending",
        sent_at: new Date().toISOString(),
        reply_to_message_id: replyToMessageId || null,
        sender_type: isAgentMessage ? "agent" : "user",
        sender_name: resolvedSenderName,
        sender_agent_id: isAgentMessage && agentId ? agentId : null,
        endpoint_id: endpoint.id,
        metadata: { meta_cloud: { phone_number_id: endpoint.sender_sid, to } },
      })
      .select("id")
      .single();
    if (insErr || !insertedMsg) return jsonResponse(500, { error: "message_insert_failed", details: insErr?.message });

    // Reply context (Meta Cloud usa context.message_id = wamid)
    let context: { message_id: string } | undefined = undefined;
    if (replyToMessageId) {
      const { data: original } = await supabase
        .from("messages")
        .select("whatsapp_message_sid")
        .eq("id", replyToMessageId)
        .maybeSingle();
      if (original?.whatsapp_message_sid) {
        context = { message_id: original.whatsapp_message_sid };
      }
    }

    // POST /v23.0/{phone_number_id}/messages
    try {
      const result = await metaWaPostJson(
        `/${endpoint.sender_sid}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: message, preview_url: false },
          ...(context ? { context } : {}),
        },
        { accessToken, appSecret },
      );

      const wamid = result?.messages?.[0]?.id ?? null;
      await supabase
        .from("messages")
        .update({
          whatsapp_status: "sent",
          whatsapp_message_sid: wamid,
          metadata: { meta_cloud: { phone_number_id: endpoint.sender_sid, to, wamid, response: result } },
        })
        .eq("id", insertedMsg.id);

      return jsonResponse(200, {
        success: true,
        messageId: insertedMsg.id,
        wamid,
        threadId: currentThreadId,
        provider: "meta_cloud_api",
      });
    } catch (e) {
      const errDetails = e instanceof MetaWaGraphError
        ? { code: e.error.code, error_subcode: e.error.error_subcode, message: e.error.message }
        : { message: (e as Error).message };
      await supabase
        .from("messages")
        .update({
          whatsapp_status: "failed",
          error_code: errDetails.code ? String(errDetails.code) : null,
          error_message: errDetails.message,
        })
        .eq("id", insertedMsg.id);
      return jsonResponse(500, { error: "meta_send_failed", details: errDetails });
    }
  } catch (e) {
    console.error("[meta-whatsapp-send] fatal", e);
    return jsonResponse(500, { error: "internal_error", message: (e as Error).message });
  }
});
