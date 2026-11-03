// Aviso do App do cliente: estado da conversa mudou. Servidor a servidor, HMAC.
// verify_jwt = false porque quem chama é o servidor do App (sem usuário Seialz);
// a autenticação é a assinatura HMAC com CLIENT_PORTAL_HMAC_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifySignature } from "../_shared/client-portal/hmac.ts";
import { isStale, NOTIFICATION_TITLE, pickRecipients, shouldNotify, validateNotify } from "./logic.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { code: "method_not_allowed" });

  const rawBody = await req.text();
  const ok = await verifySignature({
    secret: Deno.env.get("CLIENT_PORTAL_HMAC_SECRET"),
    timestampHeader: req.headers.get("x-portal-timestamp"),
    signatureHeader: req.headers.get("x-portal-signature"),
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!ok) return json(401, { code: "unauthorized" });

  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return json(400, { code: "invalid_body" }); }
  const input = validateNotify(parsed);
  if (!input) return json(400, { code: "invalid_body" });

  const orgId = Deno.env.get("CLIENT_PORTAL_ORGANIZATION_ID");
  if (!orgId) return json(500, { code: "not_configured" });
  if (input.organizationId !== orgId) return json(403, { code: "forbidden_organization" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: contact } = await db.from("contacts").select("id")
    .eq("id", input.seialzContactId).eq("organization_id", orgId).is("deleted_at", null).maybeSingle();
  if (!contact) return json(422, { code: "contact_not_found" });

  const { data: existing } = await db.from("client_portal_chat_events")
    .select("organization_id, last_message_at, assigned_user_id")
    .eq("conversation_id", input.conversationId).maybeSingle();
  if (existing && existing.organization_id !== orgId) return json(403, { code: "forbidden_organization" });
  if (isStale(existing?.last_message_at, input.lastMessageAt)) return json(200, { ok: true, ignored: "stale" });

  const { error: upErr } = await db.from("client_portal_chat_events").upsert({
    conversation_id: input.conversationId,
    organization_id: orgId,
    seialz_contact_id: input.seialzContactId,
    last_event: input.event,
    last_message_at: input.lastMessageAt,
    last_from: input.lastFrom,
    unread_for_staff: input.unreadForStaff,
  }, { onConflict: "conversation_id" });
  if (upErr) {
    console.error("[chat-notify] upsert_failed", upErr.code);
    return json(500, { code: "store_failed" });
  }

  let notified = 0;
  if (shouldNotify(input)) {
    let pool: string[] = [];
    if (!existing?.assigned_user_id) {
      const { data: members } = await db.from("user_organizations").select("user_id")
        .eq("organization_id", orgId).eq("is_active", true);
      for (const m of members ?? []) {
        const { data: p } = await db.rpc("perms_v2_for_user", { _org: orgId, _user: m.user_id });
        const ver = (p as any)?.dados?.atendimentos?.ver ?? "nenhum";
        if (ver !== "nenhum") pool.push(m.user_id);
      }
    }
    const recipients = pickRecipients(existing?.assigned_user_id, pool);
    if (recipients.length) {
      const { error } = await db.from("notifications").insert(recipients.map((uid) => ({
        organization_id: orgId,
        user_id: uid,
        type: "client_portal_chat",
        title: NOTIFICATION_TITLE,
        entity_type: "client_portal_chat",
        entity_id: input.conversationId,
      })));
      if (error) console.error("[chat-notify] notify_failed", error.code);
      else notified = recipients.length;
    }
  }

  return json(200, { ok: true, notified });
});
