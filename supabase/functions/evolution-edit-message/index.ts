// evolution-edit-message — V1 piloto (flag evolution_message_edit_v1).
// Edita texto já enviado via Evolution API. Autoridade final de:
// autoria, organização, provider, tipo de mensagem, janela de 15 min e remoteJid.
//
// IMPORTANTE (Fase 0): a Evolution responde 200 + MESSAGE_EDIT + PENDING mesmo
// quando o WhatsApp descarta a edição. Portanto gravamos a edição como
// ACEITA/SUBMETIDA (provider_status='submitted'), nunca como entregue.
// Meta/Twilio: não suportados (409 provider_not_supported).
// TODO: sincronizar edições feitas direto no celular (fase posterior).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { acceptedEdit, checkEditable, MAX_TEXT, type MsgRow, PROVIDER, resolveEditKey } from "./logic.ts";

const FLAG = "evolution_message_edit_v1";

// Mesma fonte e regra do frontend (useMessageEditFlag): public.feature_flags,
// flag ligada + org no escopo (lista vazia = global). Fail-closed em erro.
// deno-lint-ignore no-explicit-any
async function featureFlagEnabled(db: any, name: string, orgId: string): Promise<boolean> {
  const { data, error } = await db.from("feature_flags")
    .select("is_enabled, organization_ids").eq("name", name).maybeSingle();
  if (error || !data || data.is_enabled !== true) return false;
  const orgs = (data.organization_ids ?? []) as string[];
  return orgs.length === 0 || orgs.includes(orgId);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const messageId = body?.message_id;
  const rawText = body?.new_text;
  if (typeof messageId !== "string" || !UUID.test(messageId)) return json(400, { error: "invalid_message_id" });
  if (typeof rawText !== "string") return json(400, { error: "invalid_text" });
  const newText = rawText.trim();
  if (!newText || newText.length > MAX_TEXT) return json(400, { error: "invalid_text" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authErr } = await userClient.auth.getUser();
  if (authErr || !auth?.user) return json(401, { error: "unauthorized" });

  const db = createClient(url, service);
  const { data: me } = await db.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!me?.id) return json(401, { error: "unauthorized" });

  const { data: msg } = await db.from("messages").select(
    "id, organization_id, thread_id, sender_user_id, sender_type, direction, content, sent_at, deleted_at, is_internal_note, template_id, media_urls, media_type, error_code, whatsapp_status, whatsapp_message_sid, endpoint_id, edit_count, metadata",
  ).eq("id", messageId).maybeSingle();
  if (!msg) return json(404, { error: "not_found" });
  const m = msg as MsgRow;

  const { data: membership } = await db.from("user_organizations").select("id")
    .eq("user_id", me.id).eq("organization_id", m.organization_id).eq("is_active", true).maybeSingle();
  if (!membership) return json(403, { error: "forbidden" });

  if (!(await featureFlagEnabled(db, FLAG, m.organization_id))) return json(403, { error: "feature_disabled" });

  const rule = checkEditable(m, me.id, newText, Date.now());
  if (rule === "not_author") return json(403, { error: rule });
  if (rule) return json(409, { error: rule });

  if (!m.endpoint_id) return json(409, { error: "provider_not_supported" });
  const { data: ep } = await db.from("communication_endpoints").select("id, organization_id, provider, sender_sid")
    .eq("id", m.endpoint_id).maybeSingle();
  if (!ep || ep.organization_id !== m.organization_id || ep.provider !== PROVIDER) {
    return json(409, { error: "provider_not_supported" });
  }

  const key = resolveEditKey(m);
  if (!key) return json(409, { error: "remote_jid_invalid" });

  const { data: inst } = await db.from("evolution_instances").select("instance_name").eq("endpoint_id", ep.id).maybeSingle();
  const instanceName = (inst as { instance_name?: string } | null)?.instance_name ?? ep.sender_sid;
  if (!instanceName || (key.instanceName && key.instanceName !== instanceName)) {
    return json(409, { error: "instance_mismatch" });
  }

  const baseUrl = Deno.env.get("EVOLUTION_BASE_URL")?.trim().replace(/\/+$/, "");
  const apiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
  if (!baseUrl || !apiKey) return json(500, { error: "evolution_not_configured" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let status = 0;
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try {
    const res = await fetch(`${baseUrl}/chat/updateMessage/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: key.number, key: { remoteJid: key.remoteJid, fromMe: true, id: key.id }, text: newText }),
      signal: controller.signal,
    });
    status = res.status;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  } catch (e) {
    console.error("[evolution-edit-message] upstream_error", { messageId, err: String(e) });
    return json(502, { error: "provider_unreachable" });
  } finally {
    clearTimeout(timer);
  }

  const accepted = status >= 200 && status < 300 ? acceptedEdit(data, key.id) : null;
  if (!accepted) {
    console.error("[evolution-edit-message] provider_rejected", { messageId, status });
    return json(502, { error: "provider_rejected", status, details: data });
  }

  const { data: applied, error: rpcErr } = await db.rpc("rpc_apply_message_edit_v1", {
    p_message_id: m.id,
    p_expected_content: m.content,
    p_expected_edit_count: m.edit_count ?? 0,
    p_new_content: newText,
    p_user_id: me.id,
    p_provider: PROVIDER,
    p_edit_key_id: accepted.editKeyId,
    p_response: { status, body: data },
  });
  if (rpcErr || !applied?.ok) {
    // A Evolution já aceitou; o Seialz não gravou. Registrado para auditoria.
    console.error("[evolution-edit-message] persist_failed", { messageId, rpcErr: rpcErr?.message, applied });
    return json(applied?.error === "concurrent_edit" ? 409 : 500, { error: applied?.error ?? "persist_failed" });
  }

  return json(200, {
    message_id: m.id,
    content: newText,
    edited_at: applied.edited_at,
    edit_count: applied.edit_count,
    provider_status: "submitted",
  });
});
