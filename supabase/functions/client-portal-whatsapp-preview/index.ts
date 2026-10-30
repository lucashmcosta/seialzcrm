// client-portal-whatsapp-preview — SOMENTE LEITURA, servidor-a-servidor.
// Mostra ao app de clientes da Central as últimas mensagens do Atendimento.
// verify_jwt=false: autenticação por HMAC (CLIENT_PORTAL_HMAC_SECRET). Não grava nada.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedThreadIds,
  buildPreview,
  FORBIDDEN_ENDPOINT_ID,
  validatePreviewInput,
  verifySignature,
} from "./logic.ts";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const err = (status: number, code: string) => json(status, { code });

Deno.serve(async (req) => {
  if (req.method !== "POST") return err(405, "method_not_allowed");

  const rawBody = await req.text();
  const ok = await verifySignature({
    secret: Deno.env.get("CLIENT_PORTAL_HMAC_SECRET"),
    timestampHeader: req.headers.get("x-portal-timestamp"),
    signatureHeader: req.headers.get("x-portal-signature"),
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!ok) return err(401, "unauthorized");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return err(400, "invalid_input");
  }
  const input = validatePreviewInput(parsed);
  if (!input) return err(400, "invalid_input");

  const orgId = Deno.env.get("CLIENT_PORTAL_ORGANIZATION_ID");
  const endpointId = Deno.env.get("CLIENT_PORTAL_OTP_ENDPOINT_ID");
  if (!orgId || !endpointId || endpointId === FORBIDDEN_ENDPOINT_ID) {
    console.error("[client-portal-whatsapp-preview] config_error");
    return err(500, "config_error");
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: contacts, error: cErr } = await supabase
      .from("contacts").select("id")
      .eq("organization_id", orgId).is("deleted_at", null).in("id", input.contactIds);
    if (cErr) throw new Error("contacts_lookup");
    const contactIds = (contacts ?? []).map((c) => c.id);
    if (contactIds.length === 0) return json(200, { messages: [] });

    const { data: threads, error: tErr } = await supabase
      .from("message_threads").select("id, channel, primary_endpoint_id")
      .eq("organization_id", orgId).eq("channel", "whatsapp")
      .eq("primary_endpoint_id", endpointId).in("contact_id", contactIds);
    if (tErr) throw new Error("threads_lookup");
    const threadIds = allowedThreadIds(threads ?? [], endpointId);
    if (threadIds.length === 0) return json(200, { messages: [] });

    // media_urls propositalmente NÃO selecionado.
    const { data: msgs, error: mErr } = await supabase
      .from("messages")
      .select("id, thread_id, direction, content, media_type, created_at, sender_type, sender_user_id, is_internal_note, deleted_at")
      .eq("organization_id", orgId).in("thread_id", threadIds)
      .eq("is_internal_note", false).is("deleted_at", null)
      .in("direction", ["inbound", "outbound"])
      .or("sender_type.is.null,sender_type.neq.system")
      .order("created_at", { ascending: false }).limit(input.limit);
    if (mErr) throw new Error("messages_lookup");

    const userIds = Array.from(new Set((msgs ?? []).filter((m) => m.direction === "outbound" && m.sender_user_id).map((m) => m.sender_user_id as string)));
    const names = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users, error: uErr } = await supabase
        .from("users").select("id, full_name").in("id", userIds);
      if (uErr) throw new Error("users_lookup");
      for (const u of users ?? []) if (u.full_name) names.set(u.id, u.full_name);
    }

    return json(200, { messages: buildPreview(msgs ?? [], threadIds, names, input.limit) });
  } catch (e) {
    console.error("[client-portal-whatsapp-preview] lookup_failed", e instanceof Error ? e.message : "unknown");
    return err(500, "internal_error");
  }
});
