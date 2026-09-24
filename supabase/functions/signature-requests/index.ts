// Seialz Web → SuvSign Signing Engine V2 (backend único; web e mobile consomem).
// Auth: JWT do usuário validado em código. Organização SEMPRE derivada do registro
// (oportunidade/solicitação) lido com o client do usuário (RLS herda owner/view_all).
// O navegador nunca envia organization_id, credencial ou conta SuvSign.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/crypto.ts";
import { featureFlagEnabled } from "../_shared/feature-flags.ts";
const SIGNING_V2_PILOT_FLAG = "signing.suvsign_v2_pilot";
import {
  canonicalJson, CrmPerson, DEFAULT_V2_BASE, fillFrozenContent, friendlyTemplateError, loadV2Credentials,
  mapOperationStatus, sha256Hex, SIGNING_V2_FLAG, suvsignFetch,
} from "../_shared/suvsign-v2.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// deno-lint-ignore no-explicit-any
type Any = any;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, message: string, s = 400, extra: Record<string, unknown> = {}) => json({ error: code, message, ...extra }, s);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return fail("unauthorized", "Sessão ausente", 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return fail("unauthorized", "Sessão inválida", 401);
  const userDb = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: me } = await admin.from("users").select("id, full_name, email").eq("auth_user_id", u.user.id).maybeSingle();
  if (!me) return fail("unauthorized", "Usuário sem cadastro", 401);

  let body: Any;
  try { body = await req.json(); } catch { return fail("invalid_json", "JSON inválido"); }
  const action = String(body?.action ?? "");

  async function isMember(orgId: string) {
    const { data } = await admin.from("user_organizations").select("id").eq("user_id", me!.id)
      .eq("organization_id", orgId).eq("is_active", true).maybeSingle();
    return !!data;
  }
  // Oportunidade lida com o client do usuário → RLS real (owner/view_all).
  async function loadOpp(id: unknown) {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const { data } = await userDb.from("opportunities").select("id, organization_id, contact_id, title, amount, close_date").eq("id", id).maybeSingle();
    if (!data || !(await isMember(data.organization_id))) return null;
    return data;
  }
  async function loadRequest(id: unknown) {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const { data } = await userDb.from("signature_requests").select("*").eq("id", id).maybeSingle();
    if (!data || !(await isMember(data.organization_id))) return null;
    return data;
  }
  async function canManage(orgId: string) {
    const { data } = await userDb.rpc("can_manage_integrations_in_org", { _org_id: orgId });
    return data === true;
  }
  async function currentOrgFromBody() {
    // Para ações de configuração: org informada é só uma escolha, validada contra o vínculo.
    const orgId = body?.organization_id;
    if (typeof orgId !== "string" || !UUID.test(orgId) || !(await isMember(orgId))) return null;
    return orgId;
  }

  // Piloto: flag separada libera só novos envios V2, sem trocar o botão V1.
  const v2SendAllowed = async (orgId: string) =>
    (await featureFlagEnabled(admin, SIGNING_V2_FLAG, orgId)) || (await featureFlagEnabled(admin, SIGNING_V2_PILOT_FLAG, orgId));

  try {
    switch (action) {
      // ---------------- Capability + solicitações existentes ----------------
      case "get_capability": {
        const opp = await loadOpp(body.opportunity_id);
        if (!opp) return fail("not_found", "Oportunidade não encontrada", 404);
        const enabled = await featureFlagEnabled(admin, SIGNING_V2_FLAG, opp.organization_id);
        const { data: cred } = await admin.from("suvsign_v2_credentials").select("organization_id").eq("organization_id", opp.organization_id).maybeSingle();
        const { data: requests } = await userDb.from("signature_requests")
          .select("id, status, template_name, provider_operation_id, sent_at, completed_at, cancelled_at, created_at, last_error, provider_documents, signature_request_participants(id, ref, name, email, role, status, opened_at, signed_at, order_index)")
          .eq("opportunity_id", opp.id).order("created_at", { ascending: false });
        const pilot = await featureFlagEnabled(admin, SIGNING_V2_PILOT_FLAG, opp.organization_id);
        return json({ v2_enabled: enabled, pilot_enabled: pilot, has_credentials: !!cred, requests: requests ?? [] });
      }

      // ---------------- Credenciais (admin da org) ----------------
      case "get_credentials_status": {
        const orgId = await currentOrgFromBody();
        if (!orgId || !(await canManage(orgId))) return fail("forbidden", "Sem permissão", 403);
        const { data } = await admin.from("suvsign_v2_credentials").select("api_key_last4, webhook_secret_ciphertext, base_url, last_test_at, last_test_ok, updated_at").eq("organization_id", orgId).maybeSingle();
        const enabled = await featureFlagEnabled(admin, SIGNING_V2_FLAG, orgId);
        return json({
          configured: !!data, api_key_masked: data ? `••••${data.api_key_last4 ?? ""}` : null,
          has_webhook_secret: !!data?.webhook_secret_ciphertext, base_url: data?.base_url ?? DEFAULT_V2_BASE,
          last_test_at: data?.last_test_at ?? null, last_test_ok: data?.last_test_ok ?? null, v2_enabled: enabled,
          webhook_url: `${url}/functions/v1/suvsign-v2-webhook`,
        });
      }
      case "save_credentials": {
        const orgId = await currentOrgFromBody();
        if (!orgId || !(await canManage(orgId))) return fail("forbidden", "Sem permissão", 403);
        const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
        const whs = typeof body.webhook_secret === "string" ? body.webhook_secret.trim() : "";
        const { data: existing } = await admin.from("suvsign_v2_credentials").select("organization_id").eq("organization_id", orgId).maybeSingle();
        if (!existing && !apiKey) return fail("api_key_required", "Informe a chave de API");
        if (apiKey && apiKey.length > 512) return fail("invalid_api_key", "Chave inválida");
        if (whs && whs.length > 512) return fail("invalid_webhook_secret", "Segredo inválido");
        const patch: Record<string, unknown> = { organization_id: orgId, updated_by: me.id };
        if (apiKey) { patch.api_key_ciphertext = await encryptSecret(apiKey); patch.api_key_last4 = apiKey.slice(-4); patch.last_test_at = null; patch.last_test_ok = null; }
        if (whs) patch.webhook_secret_ciphertext = await encryptSecret(whs);
        const { error } = existing
          ? await admin.from("suvsign_v2_credentials").update(patch).eq("organization_id", orgId)
          : await admin.from("suvsign_v2_credentials").insert(patch);
        if (error) throw error;
        return json({ ok: true });
      }
      case "test_connection": {
        const orgId = await currentOrgFromBody();
        if (!orgId || !(await canManage(orgId))) return fail("forbidden", "Sem permissão", 403);
        const creds = await loadV2Credentials(admin, orgId);
        if (!creds) return fail("not_configured", "Credencial V2 não configurada", 409);
        const r = await suvsignFetch(creds, "api-handler", "/templates", { method: "GET" });
        await admin.from("suvsign_v2_credentials").update({ last_test_at: new Date().toISOString(), last_test_ok: r.ok }).eq("organization_id", orgId);
        return json({ ok: r.ok, status: r.status, templates: r.ok ? (r.body?.templates?.length ?? 0) : null });
      }

      // ---------------- Modelos ----------------
      case "list_templates": {
        const opp = await loadOpp(body.opportunity_id);
        if (!opp) return fail("not_found", "Oportunidade não encontrada", 404);
        if (!(await v2SendAllowed(opp.organization_id))) return fail("v2_disabled", "Novo fluxo de assinatura não habilitado", 409);
        const creds = await loadV2Credentials(admin, opp.organization_id);
        if (!creds) return fail("not_configured", "Credencial V2 não configurada", 409);
        const r = await suvsignFetch(creds, "api-handler", "/templates", { method: "GET" });
        if (!r.ok) return fail("provider_error", "Não foi possível listar os modelos na SuvSign", 502, { provider_status: r.status });
        const templates = (r.body?.templates ?? []).map((t: Any) => ({
          id: t.id, name: t.name, description: t.description ?? null, category: t.category ?? null,
          roles: t.roles ?? [], v2_compatible: t.v2_compatible === true,
          v2_unsupported_features: Array.isArray(t.v2_unsupported_features) ? t.v2_unsupported_features : [],
        }));
        return json({ templates });
      }

      // ---------------- Preparar (único momento em que o CRM é lido) ----------------
      case "prepare_contract": {
        const opp = await loadOpp(body.opportunity_id);
        if (!opp) return fail("not_found", "Oportunidade não encontrada", 404);
        if (!(await v2SendAllowed(opp.organization_id))) return fail("v2_disabled", "Novo fluxo de assinatura não habilitado", 409);
        const templateId = typeof body.template_id === "string" ? body.template_id.trim() : "";
        if (!templateId || templateId.length > 100) return fail("template_required", "Escolha um modelo");
        const creds = await loadV2Credentials(admin, opp.organization_id);
        if (!creds) return fail("not_configured", "Credencial V2 não configurada", 409);

        // 1) definição V2 oficial — qualquer 422/404 bloqueia ANTES de criar operação
        const t = await suvsignFetch(creds, "api-handler", `/templates/${encodeURIComponent(templateId)}?include=v2_definition`, { method: "GET" });
        if (!t.ok || !t.body?.v2_definition) {
          return fail(t.body?.error ?? "template_unavailable", friendlyTemplateError(t.body?.error), t.status === 404 ? 404 : 422,
            { unsupported_features: t.body?.unsupported_features ?? [] });
        }
        const def = t.body.v2_definition;

        // 2) CRM (paridade SendToSignatureButton)
        if (!opp.contact_id) return fail("contact_required", "Oportunidade sem contato");
        const { data: contact } = await userDb.from("contacts")
          .select("id, full_name, first_name, last_name, email, phone, cpf, rg, rg_issuer, nationality, address_street, address_neighborhood, address_city, address_state, address_zip")
          .eq("id", opp.contact_id).maybeSingle();
        if (!contact) return fail("contact_not_found", "Contato não encontrado", 404);
        const v = (s: unknown) => (typeof s === "string" ? s : s == null ? "" : String(s)).trim();
        const parts = v(contact.full_name).split(/\s+/).filter(Boolean);
        const firstName = v(contact.first_name) || parts[0] || "";
        const lastName = v(contact.last_name) || (parts.length > 1 ? parts.slice(1).join(" ") : "");
        const missing: string[] = [];
        const req = (label: string, val: unknown) => { if (!v(val)) missing.push(label); };
        if (!firstName) missing.push("Nome");
        req("Email", contact.email); req("Telefone", contact.phone); req("CPF", contact.cpf); req("RG", contact.rg);
        req("Órgão Emissor do RG", contact.rg_issuer); req("Nacionalidade", contact.nationality);
        req("Endereço", contact.address_street); req("Bairro", contact.address_neighborhood); req("Cidade", contact.address_city);
        req("Estado", contact.address_state); req("CEP", contact.address_zip);
        if (missing.length) return fail("missing_contact_fields", `Campos obrigatórios não preenchidos: ${missing.join(", ")}`, 422, { missing, contact_id: contact.id });

        const custom: Record<string, string> = { contact_id: contact.id };
        for (const k of ["cpf", "rg", "rg_issuer", "nationality", "address_street", "address_neighborhood", "address_city", "address_state", "address_zip"]) {
          if (v((contact as Any)[k])) custom[k] = v((contact as Any)[k]);
        }
        custom.deal_id = opp.id; custom.deal_title = opp.title ?? "";
        if (opp.amount) custom.deal_amount = String(opp.amount);
        if (opp.close_date) custom.deal_close_date = new Date(`${opp.close_date}T00:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
        const client: CrmPerson = { first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}`.trim(), email: v(contact.email), phone: v(contact.phone) };

        // 3) roles → participantes reais do CRM (nunca e-mail vindo do modelo)
        const extras: Record<string, { name?: string; email?: string }> = body.signers && typeof body.signers === "object" ? body.signers : {};
        const signatories: Any[] = Array.isArray(def.signatories) ? def.signatories : [];
        const nonCreator = signatories.filter((s) => !s.is_creator);
        const participants: Any[] = []; const roleData: Record<string, CrmPerson> = {}; const unresolved: Any[] = [];
        signatories.forEach((s, i) => {
          let person: CrmPerson | null = null;
          if (s.is_creator) {
            const n = v(me.full_name); const p = n.split(/\s+/);
            person = { first_name: p[0] ?? "", last_name: p.slice(1).join(" "), name: n, email: v(me.email), phone: "" };
          } else if (s.ref === "client" || nonCreator.length === 1 || nonCreator[0]?.ref === s.ref) {
            person = client;
          } else {
            const e = extras[s.ref];
            const name = v(e?.name); const email = v(e?.email).toLowerCase();
            if (name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && name.length <= 200 && email.length <= 255) {
              const p = name.split(/\s+/);
              person = { first_name: p[0], last_name: p.slice(1).join(" "), name, email, phone: "" };
            }
          }
          if (!person || !person.email) { unresolved.push({ ref: s.ref, display_name: s.display_name }); return; }
          roleData[s.ref] = person;
          participants.push({ ref: s.ref, name: person.name || person.email, email: person.email, phone: person.phone || null,
            cpf: person === client ? v(contact.cpf) || null : null, role: "signer", template_role: s.role ?? s.display_name ?? null, order_index: i });
        });
        if (unresolved.length) return fail("signers_required", "Informe nome e e-mail dos demais signatários", 422, { unresolved });

        const ctx = { roles: roleData, contact: client, deal: {}, custom, templateName: t.body.name ?? "", now: new Date() };
        const frozen = fillFrozenContent(def.frozen_content, ctx);
        const refs = new Set(participants.map((p) => p.ref));
        const fields = (def.fields ?? []).filter((f: Any) => refs.has(f.template_signatory_ref)).map((f: Any) => ({
          participant_ref: f.template_signatory_ref, field_type: f.field_type, label: f.label ?? null, page_number: f.page_number,
          position_x: f.position_x, position_y: f.position_y, width: f.width, height: f.height,
          is_required: f.is_required !== false, metadata: f.metadata ?? {},
        }));
        const snapshot = {
          version: 1, template: { id: templateId, name: t.body.name ?? null, layout_mode: def.layout_mode, coordinate_system: def.coordinate_system },
          participants: participants.map(({ template_role: _r, ...p }) => p),
          documents: [{ ref: "d1", title: t.body.name ?? opp.title ?? "Contrato", frozen_content: frozen, fields }],
          variables: { client, custom }, prepared_at: ctx.now.toISOString(), prepared_by: me.id,
        };
        const snapshotSha = await sha256Hex(canonicalJson(snapshot));
        const { data: created, error } = await admin.from("signature_requests").insert({
          organization_id: opp.organization_id, opportunity_id: opp.id, contact_id: contact.id, created_by: me.id,
          engine: "suvsign_v2", template_id: templateId, template_name: t.body.name ?? null,
          idempotency_key: `seialz:${crypto.randomUUID()}`, status: "draft", snapshot, snapshot_sha256: snapshotSha,
        }).select("id").single();
        if (error) throw error;
        const { error: pErr } = await admin.from("signature_request_participants").insert(participants.map((p) => ({
          request_id: created.id, organization_id: opp.organization_id, ref: p.ref, name: p.name, email: p.email, phone: p.phone,
          cpf: p.cpf, role: p.role, template_role: p.template_role, order_index: p.order_index, status: "pending",
        })));
        if (pErr) throw pErr;
        return json({ request_id: created.id, snapshot_sha256: snapshotSha, snapshot });
      }

      case "get_preview": {
        const r = await loadRequest(body.request_id);
        if (!r) return fail("not_found", "Solicitação não encontrada", 404);
        return json({ request_id: r.id, status: r.status, snapshot: r.snapshot, snapshot_sha256: r.snapshot_sha256 });
      }

      // ---------------- Enviar (usa SOMENTE o snapshot salvo) ----------------
      case "send_for_signature": {
        const r = await loadRequest(body.request_id);
        if (!r) return fail("not_found", "Solicitação não encontrada", 404);
        if (r.status !== "draft") return json({ request_id: r.id, status: r.status, already: true });
        if (!(await v2SendAllowed(r.organization_id))) return fail("v2_disabled", "Novo fluxo de assinatura não habilitado", 409);
        if ((await sha256Hex(canonicalJson(r.snapshot))) !== r.snapshot_sha256) return fail("snapshot_mismatch", "O conteúdo preparado foi alterado. Prepare novamente.", 409);
        const creds = await loadV2Credentials(admin, r.organization_id);
        if (!creds) return fail("not_configured", "Credencial V2 não configurada", 409);

        let opId: string | null = r.provider_operation_id;
        if (!opId) {
          const s = r.snapshot;
          const c = await suvsignFetch(creds, "api-v2", "/signing-operations", {
            method: "POST", idempotencyKey: r.idempotency_key,
            body: JSON.stringify({ source: "seialz", external_id: r.id, metadata: { custom: { seialz_request_id: r.id, seialz_opportunity_id: r.opportunity_id } },
              participants: s.participants, documents: s.documents }),
          });
          if (c.status === 409 && c.body?.error === "signing_engine_v2_not_enabled") return fail("signing_engine_v2_not_enabled", "V2 não habilitado na SuvSign para esta conta.", 409);
          if (!c.ok) {
            await admin.from("signature_requests").update({ last_error: `create:${c.status}:${c.body?.error ?? ""}` }).eq("id", r.id);
            return fail(c.body?.error ?? "provider_error", "A SuvSign recusou a criação do envio.", 502, { provider_status: c.status, detail: c.body?.detail ?? null });
          }
          opId = String(c.body?.id ?? c.body?.operation?.id ?? "");
          if (!opId) return fail("provider_error", "Resposta da SuvSign sem id da operação", 502);
          await admin.from("signature_requests").update({ provider_operation_id: opId, last_error: null }).eq("id", r.id);
        }
        const snd = await suvsignFetch(creds, "api-v2", `/signing-operations/${encodeURIComponent(opId)}/send`, { method: "POST" });
        let op = snd.body;
        if (!snd.ok) {
          if (snd.status === 409 && snd.body?.error === "invalid_state") {
            const g = await suvsignFetch(creds, "api-v2", `/signing-operations/${encodeURIComponent(opId)}`, { method: "GET" });
            op = g.body;
          } else {
            await admin.from("signature_requests").update({ last_error: `send:${snd.status}:${snd.body?.error ?? ""}` }).eq("id", r.id);
            if (snd.body?.error === "signing_engine_v2_not_enabled") return fail("signing_engine_v2_not_enabled", "V2 não habilitado na SuvSign para esta conta.", 409);
            return fail(snd.body?.error ?? "provider_error", "A SuvSign recusou o envio.", 502, { provider_status: snd.status });
          }
        }
        await syncFromOperation(admin, r, op);
        await admin.from("activities").insert({
          organization_id: r.organization_id, opportunity_id: r.opportunity_id, contact_id: r.contact_id, activity_type: "system",
          title: "Contrato enviado para assinatura", body: `${r.template_name ?? "Contrato"} enviado pela SuvSign.`,
          created_by_user_id: me.id, source_external_id: `suvsign_v2:${opId}:sent`,
        });
        return json({ request_id: r.id, status: "sent", provider_operation_id: opId });
      }

      case "get_signature_status": {
        const r = await loadRequest(body.request_id);
        if (!r) return fail("not_found", "Solicitação não encontrada", 404);
        if (r.provider_operation_id) {
          const creds = await loadV2Credentials(admin, r.organization_id);
          if (creds) {
            const g = await suvsignFetch(creds, "api-v2", `/signing-operations/${encodeURIComponent(r.provider_operation_id)}`, { method: "GET" });
            if (g.ok) await syncFromOperation(admin, r, g.body);
          }
        }
        const { data } = await userDb.from("signature_requests").select("id, status, sent_at, completed_at, cancelled_at, provider_documents, signature_request_participants(ref, name, email, status, opened_at, signed_at, order_index)").eq("id", r.id).maybeSingle();
        return json(data);
      }

      case "cancel_signature": {
        const r = await loadRequest(body.request_id);
        if (!r) return fail("not_found", "Solicitação não encontrada", 404);
        if (["completed", "completing", "cancelled"].includes(r.status)) return fail("invalid_state", "Esta solicitação não pode mais ser cancelada", 409);
        if (r.provider_operation_id) {
          const creds = await loadV2Credentials(admin, r.organization_id);
          if (!creds) return fail("not_configured", "Credencial V2 não configurada", 409);
          const c = await suvsignFetch(creds, "api-v2", `/signing-operations/${encodeURIComponent(r.provider_operation_id)}/cancel`, { method: "POST" });
          if (!c.ok) return fail(c.body?.error ?? "provider_error", c.status === 409 ? "Esta solicitação não pode mais ser cancelada" : "A SuvSign recusou o cancelamento.", c.status === 409 ? 409 : 502);
        }
        const now = new Date().toISOString();
        await admin.from("signature_requests").update({ status: "cancelled", cancelled_at: now }).eq("id", r.id);
        await admin.from("activities").insert({
          organization_id: r.organization_id, opportunity_id: r.opportunity_id, contact_id: r.contact_id, activity_type: "system",
          title: "Envio de contrato cancelado", body: r.template_name ?? null, created_by_user_id: me.id,
          source_external_id: `suvsign_v2:${r.provider_operation_id ?? r.id}:cancelled`,
        });
        return json({ request_id: r.id, status: "cancelled" });
      }

      case "get_download_url": {
        const r = await loadRequest(body.request_id);
        if (!r?.provider_operation_id) return fail("not_found", "Solicitação não encontrada", 404);
        const docs: Any[] = Array.isArray(r.provider_documents) ? r.provider_documents : [];
        const docId = typeof body.document_id === "string" ? body.document_id : docs[0]?.document_id;
        if (!docId || !docs.some((d) => d.document_id === docId)) return fail("not_found", "Documento não encontrado", 404);
        const creds = await loadV2Credentials(admin, r.organization_id);
        if (!creds) return fail("not_configured", "Credencial V2 não configurada", 409);
        const d = await suvsignFetch(creds, "api-v2", `/signing-operations/${encodeURIComponent(r.provider_operation_id)}/documents/${encodeURIComponent(docId)}/download`, { method: "GET" });
        if (d.status === 409) return fail("not_finalized", "O documento ainda não foi finalizado", 409);
        if (!d.ok) return fail("provider_error", "Não foi possível gerar o link de download", 502);
        return json({ url: d.body?.url ?? d.body?.signed_url ?? null, expires_in: d.body?.expires_in ?? 300 });
      }

      default:
        return fail("unknown_action", "Ação desconhecida");
    }
  } catch (e) {
    console.error("[signature-requests]", action, (e as Error)?.message);
    return fail("internal_error", "Erro interno", 500);
  }
});

// Sincroniza status/participantes/documentos a partir do GET/send da SuvSign.
async function syncFromOperation(admin: Any, r: Any, op: Any) {
  if (!op || typeof op !== "object") return;
  const status = mapOperationStatus(op.status);
  const patch: Record<string, unknown> = {};
  if (status && status !== "draft") patch.status = status;
  if (status && status !== "draft" && !r.sent_at) patch.sent_at = new Date().toISOString();
  if (status === "completed" && !r.completed_at) patch.completed_at = op.completed_at ?? new Date().toISOString();
  if (status === "cancelled" && !r.cancelled_at) patch.cancelled_at = op.cancelled_at ?? new Date().toISOString();
  if (Array.isArray(op.documents)) {
    patch.provider_documents = op.documents.map((d: Any) => ({
      document_id: d.id, provider_document_id: d.document_id ?? null, ref: d.ref ?? null, title: d.title ?? null, status: d.render_status ?? d.status ?? null,
      content_sha256: d.content_sha256 ?? null, final_sha256: d.final_sha256 ?? null, verification_code: d.verification_code ?? null,
    }));
  }
  if (Object.keys(patch).length) await admin.from("signature_requests").update(patch).eq("id", r.id);
  for (const p of (Array.isArray(op.participants) ? op.participants : [])) {
    if (!p?.ref) continue;
    await admin.from("signature_request_participants").update({
      provider_participant_id: p.id ?? null, status: p.status ?? "invited",
      opened_at: p.opened_at ?? null, signed_at: p.signed_at ?? null,
    }).eq("request_id", r.id).eq("ref", p.ref);
  }
}
