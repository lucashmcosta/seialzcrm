// thread-migrate-endpoint-send
//
// Migração explícita de thread para o endpoint Evolution + envio livre.
//
// Fluxo:
//   1. Validar JWT do usuário e vínculo à organização.
//   2. Validar target endpoint (Evolution, ativo, mesma org, whatsapp).
//   3. Validar thread (existe, mesma org, canal whatsapp). Capturar
//      `originalPrimaryEndpointId` para rollback.
//   4. UPDATE thread.primary_endpoint_id = target.
//   5. Invocar `evolution-whatsapp-send` (que agora aceita, pois primary bate).
//   6. Se envio FALHOU → rollback do primary. Retornar erro.
//   7. Se envio OK → inserir nota interna idempotente
//      (metadata.kind = 'THREAD_PROVIDER_MIGRATED') e retornar sucesso.
//
// Este é o ÚNICO caminho autorizado para trocar o número de envio de uma
// thread com histórico. O dispatcher client-side continua bloqueando
// qualquer outra tentativa de cross-number send.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const FN = "thread-migrate-endpoint-send" as const;
const NOTE_KIND = "THREAD_PROVIDER_MIGRATED";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function last4(addr: string | null | undefined): string {
  if (!addr) return "????";
  const digits = String(addr).replace(/\D/g, "");
  return digits.slice(-4).padStart(4, "•");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ---------------------------------------------------------------------
  // Auth: JWT do usuário
  // ---------------------------------------------------------------------
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { error: "missing_auth" });

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json(401, { error: "invalid_token", details: userErr?.message });
  }
  const authUserId = userData.user.id;

  // ---------------------------------------------------------------------
  // Body
  // ---------------------------------------------------------------------
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const {
    organizationId,
    threadId,
    targetEndpointId,
    message,
    userId,
    replyToMessageId,
  } = (body ?? {}) as Record<string, any>;

  if (typeof organizationId !== "string" || !organizationId) {
    return json(400, { error: "missing_organization" });
  }
  if (typeof threadId !== "string" || !threadId) {
    return json(400, { error: "missing_thread" });
  }
  if (typeof targetEndpointId !== "string" || !targetEndpointId) {
    return json(400, { error: "missing_target_endpoint" });
  }
  if (typeof message !== "string" || !message.trim()) {
    return json(400, { error: "empty_message" });
  }
  if (message.length > 4096) {
    return json(400, { error: "message_too_long", max: 4096 });
  }

  // ---------------------------------------------------------------------
  // Verifica vínculo do caller com a organização (via public.users → auth_id)
  // ---------------------------------------------------------------------
  const { data: appUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  const appUserId = (appUser as any)?.id as string | undefined;
  if (!appUserId) return json(403, { error: "user_not_provisioned" });

  const { data: membership } = await supabase
    .from("user_organizations")
    .select("id")
    .eq("user_id", appUserId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!membership) return json(403, { error: "not_member_of_org" });

  // ---------------------------------------------------------------------
  // Validação do target endpoint (fail-closed)
  // ---------------------------------------------------------------------
  const { data: target } = await supabase
    .from("communication_endpoints")
    .select("id, organization_id, provider, channel, is_active, status, external_address, purpose")
    .eq("id", targetEndpointId)
    .maybeSingle();
  if (!target) return json(404, { error: "target_endpoint_not_found" });
  const t = target as any;
  if (t.organization_id !== organizationId) return json(403, { error: "target_endpoint_org_mismatch" });
  if (t.channel !== "whatsapp") return json(400, { error: "target_endpoint_not_whatsapp" });
  if (t.provider !== "evolution_api") return json(400, { error: "target_endpoint_not_evolution" });
  if (t.is_active !== true) return json(400, { error: "target_endpoint_inactive" });
  if (t.status === "offline") return json(400, { error: "target_endpoint_offline" });

  // ---------------------------------------------------------------------
  // Validação da thread
  // ---------------------------------------------------------------------
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id, organization_id, channel, primary_endpoint_id, contact_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return json(404, { error: "thread_not_found" });
  const th = thread as any;
  if (th.organization_id !== organizationId) return json(403, { error: "thread_org_mismatch" });
  if (th.channel !== "whatsapp") return json(400, { error: "thread_not_whatsapp" });
  if (!th.contact_id) return json(400, { error: "thread_missing_contact" });

  const originalPrimaryId = (th.primary_endpoint_id as string | null) ?? null;
  const isNoop = originalPrimaryId === targetEndpointId;

  // Endpoint atual (para nota descritiva)
  let originalEndpoint: any = null;
  if (originalPrimaryId) {
    const { data: op } = await supabase
      .from("communication_endpoints")
      .select("id, provider, external_address")
      .eq("id", originalPrimaryId)
      .maybeSingle();
    originalEndpoint = op;
  }

  console.log(`[${FN}] migrate start`, {
    threadId,
    from: originalPrimaryId,
    to: targetEndpointId,
    isNoop,
  });

  // ---------------------------------------------------------------------
  // STEP 1: SEND FIRST via evolution-whatsapp-send.
  // We pass allowExplicitEndpointMigration=true so the sender honors the
  // target endpoint without falling back to thread.primary_endpoint_id.
  // NOTHING is written to message_threads before we confirm the send.
  // ---------------------------------------------------------------------
  let sendOk = false;
  let sendJson: any = null;
  let sendStatus = 0;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/evolution-whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        organizationId,
        contactId: th.contact_id,
        threadId,
        message: message.trim(),
        userId: userId ?? appUserId,
        replyToMessageId: replyToMessageId ?? undefined,
        endpointId: targetEndpointId,
        senderContext: "messages",
        allowExplicitEndpointMigration: true,
      }),
    });
    sendStatus = res.status;
    sendJson = await res.json().catch(() => ({}));
    sendOk = res.ok && !sendJson?.error;
  } catch (e) {
    sendOk = false;
    sendJson = { error: "send_fetch_failed", details: (e as Error).message };
  }

  if (!sendOk) {
    console.warn(`[${FN}] send failed — thread untouched`, {
      threadId,
      sendStatus,
      sendError: sendJson?.error,
    });
    // Fail fast. NO UPDATE to message_threads. NO note inserted.
    return json(sendStatus && sendStatus >= 400 ? sendStatus : 502, {
      error: sendJson?.error || "send_failed",
      message: sendJson?.message || sendJson?.details || `HTTP ${sendStatus}`,
      migrated: false,
    });
  }

  // ---------------------------------------------------------------------
  // STEP 2: Send confirmed OK. Migrate the thread. NO visible system note
  // is inserted: the timeline already renders a "Número alterado" divider
  // automatically by comparing endpoint_id between consecutive messages
  // (see MessagesList.tsx). A second bubble would be redundant. Technical
  // audit lives in this function's console.log below.
  // ---------------------------------------------------------------------
  if (!isNoop) {
    const { error: upErr } = await supabase
      .from("message_threads")
      .update({ primary_endpoint_id: targetEndpointId, updated_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("organization_id", organizationId);
    if (upErr) {
      // Send already went out; surface the update failure but do NOT retry send.
      console.error(`[${FN}] send ok but thread update failed`, {
        threadId,
        error: upErr.message,
        messageId: sendJson?.messageId,
      });
      return json(500, {
        error: "thread_primary_update_failed",
        message: upErr.message,
        migrated: false,
        messageId: sendJson?.messageId,
      });
    }
  }

  console.log(`[${FN}] migrate done`, {
    threadId,
    from: originalPrimaryId,
    to: targetEndpointId,
    fromProvider: (originalEndpoint as any)?.provider ?? null,
    toProvider: "evolution_api",
    fromAddress: (originalEndpoint as any)?.external_address ?? null,
    toAddress: t.external_address ?? null,
    messageId: sendJson?.messageId,
    migratedByUserId: appUserId,
    noteKind: NOTE_KIND,
    isNoop,
  });

  return json(200, {
    migrated: !isNoop,
    messageId: sendJson?.messageId,
    newPrimaryEndpointId: targetEndpointId,
    noteInserted: false,
  });
});
