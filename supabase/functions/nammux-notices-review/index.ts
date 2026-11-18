// Tela de revisão dos avisos automáticos ao cliente (integração Nammux).
//
//   op "list"    avisos aguardando aprovação, com resultado incerto, com
//                tentativas esgotadas, e os que pararam sem sair nos últimos dias
//   op "decide"  aprova (o aviso entra na fila para sair agora) ou recusa
//
// JWT do usuário obrigatório. A permissão (Atendimentos: ver e editar) é
// conferida no banco, com a identidade do usuário: a listagem só roda depois de
// nammux_can_manage_notices, e a decisão passa pela RPC nammux_notice_decide,
// que confere de novo. As tabelas da fila são só service_role.
//
// A prévia é montada pelo mesmo código que o worker usa para enviar.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderNoticeFromDb } from "../_shared/integrations/nammux-notice-render.ts";
import { canApprove, decideErrorCode, parseRequest, REVIEW_STATUSES, SKIPPED_VISIBLE_DAYS } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { code: "method_not_allowed" });

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { code: "unauthorized" });
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { code: "unauthorized" });

  const parsed = parseRequest(await req.json().catch(() => null));
  if (!parsed) return json(400, { code: "invalid_params" });

  // Permissão conferida no banco, com a identidade de quem chamou.
  const { data: allowed, error: permError } = await userClient.rpc("nammux_can_manage_notices", {
    _organization_id: parsed.organizationId,
  });
  if (permError) return json(500, { code: "permission_check_failed" });
  if (allowed !== true) return json(403, { code: "forbidden" });

  if (parsed.op === "decide") {
    const { data, error } = await userClient.rpc("nammux_notice_decide", {
      _notice_id: parsed.noticeId,
      _approve: parsed.approve,
      _reason: parsed.reason,
    });
    if (error) {
      const mapped = decideErrorCode(error.message);
      return json(mapped.status, { code: mapped.code });
    }
    return json(200, { status: data });
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: enabled } = await admin.rpc("fn_feature_flag_enabled", {
    _flag_key: "nammux_notices",
    _organization_id: parsed.organizationId,
  });

  const since = new Date(Date.now() - SKIPPED_VISIBLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const fields = "id, organization_id, contact_id, opportunity_id, kind, subject_type, subject_id, subject_start_at, status, status_reason, send_at, expires_at, last_error, attempts, channel, created_at, updated_at";
  const [{ data: open, error: openError }, { data: skipped, error: skippedError }] = await Promise.all([
    admin.from("nammux_notices").select(fields)
      .eq("organization_id", parsed.organizationId).in("status", [...REVIEW_STATUSES])
      .order("created_at", { ascending: false }).limit(100),
    admin.from("nammux_notices").select(fields)
      .eq("organization_id", parsed.organizationId).eq("status", "skipped").gte("updated_at", since)
      .order("updated_at", { ascending: false }).limit(50),
  ]);
  if (openError || skippedError) return json(500, { code: "list_failed" });

  const rows = [...(open ?? []), ...(skipped ?? [])];
  const contactIds = [...new Set(rows.map((r) => r.contact_id))];
  const names = new Map<string, string>();
  if (contactIds.length) {
    const { data: contacts } = await admin.from("contacts").select("id, full_name")
      .eq("organization_id", parsed.organizationId).in("id", contactIds);
    for (const c of contacts ?? []) names.set(c.id, c.full_name);
  }

  const now = new Date();
  const items = [];
  for (const r of rows) {
    const rendered = await renderNoticeFromDb(admin, r);
    items.push({
      id: r.id,
      kind: r.kind,
      status: r.status,
      statusReason: r.status_reason,
      sendAt: r.send_at,
      expiresAt: r.expires_at,
      attempts: r.attempts,
      channel: r.channel,
      lastError: r.last_error,
      createdAt: r.created_at,
      contactId: r.contact_id,
      contactName: names.get(r.contact_id) ?? null,
      opportunityId: r.opportunity_id,
      // O texto que o cliente receberia agora; null quando o aviso perdeu o sentido.
      preview: rendered.ok ? rendered.rendered.text : null,
      previewProblem: rendered.ok ? null : rendered.reason,
      canApprove: rendered.ok && canApprove(r.status, r.status_reason, r.expires_at, now),
    });
  }

  return json(200, { enabled: enabled === true, items });
});
