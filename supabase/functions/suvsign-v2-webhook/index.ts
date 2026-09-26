// Webhook SuvSign Signing Engine V2 → Seialz.
// Função SEPARADA do suvsign-webhook (V1), que permanece intacto.
// Pública (verify_jwt=false) porque a SuvSign não tem JWT do Seialz; a autenticidade
// é provada por HMAC com o secret V2 da organização dona da operação.
// Organização resolvida SOMENTE por data.operation_id → signature_requests (nunca pelo payload).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hmacHex, loadV2Credentials, mapOperationStatus, suvsignFetch, timingSafeEqualHex } from "../_shared/suvsign-v2.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const raw = await req.text();
  if (raw.length > 1_000_000) return json({ error: "payload_too_large" }, 413);
  let payload: Any;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  // Webhook é por conta na SuvSign: eventos V1 também chegam aqui. 200 evita retry; nada é gravado.
  if (payload?.engine !== "v2") return json({ ok: true, skipped: "not_v2" }, 200);

  const event = String(req.headers.get("x-suvsign-event") ?? payload.event ?? "");
  const delivery = req.headers.get("x-suvsign-delivery") ?? "";
  const opId = String(payload?.data?.operation_id ?? "");
  if (!opId || opId.length > 100) return json({ error: "operation_id_required" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: r } = await admin.from("signature_requests").select("*").eq("provider_operation_id", opId).maybeSingle();
  // Não revela existência: 404 genérico.
  if (!r) return json({ error: "not_found" }, 404);

  const creds = await loadV2Credentials(admin, r.organization_id);
  if (!creds?.webhookSecret) return json({ error: "not_configured" }, 401);
  const ts = req.headers.get("x-suvsign-timestamp");
  const sigNew = (req.headers.get("x-suvsign-signature") ?? "").toLowerCase();
  const sigLegacy = (req.headers.get("x-webhook-signature") ?? "").toLowerCase();
  let valid = false;
  if (ts && sigNew) {
    const age = Math.abs(Date.now() - Date.parse(ts));
    valid = Number.isFinite(age) && age < 15 * 60_000 && timingSafeEqualHex(await hmacHex(creds.webhookSecret, `${ts}.${raw}`), sigNew);
  }
  if (!valid && sigLegacy) valid = timingSafeEqualHex(await hmacHex(creds.webhookSecret, raw), sigLegacy);
  if (!valid) return json({ error: "invalid_signature" }, 401);

  const logical = `suvsign_v2:${opId}:${event}:${payload?.data?.signatory?.id ?? payload?.data?.document_id ?? ""}`;
  const { data: seen } = await admin.from("activities").select("id").eq("organization_id", r.organization_id).eq("source_external_id", logical).maybeSingle();

  // Status autoritativo: GET da operação (idempotente).
  const g = await suvsignFetch(creds, "api-v2", `/signing-operations/${encodeURIComponent(opId)}`, { method: "GET" });
  if (g.ok) await sync(admin, r, g.body);

  if (event === "document.completed") {
    const res = await storePdf(admin, r, payload);
    if (!res.ok) return json({ error: res.error }, 500); // retry da SuvSign mantém o mesmo delivery
    // Paridade Nammux: mesmo chokepoint da V1 (trigger fn_emit_nammux_contact_contract_v1 no insert
    // + replay idempotente por idempotency_key). Reforço explícito cobre o caminho "documento já existia".
    const docRef = String(payload?.data?.document_id ?? payload?.document?.id ?? "");
    if (docRef) {
      const { data: d } = await admin.from("documents").select("id").eq("organization_id", r.organization_id)
        .eq("external_source", "suvsign_v2").eq("external_ref", docRef).is("deleted_at", null).maybeSingle();
      if (d?.id) {
        const { error: e } = await admin.rpc("fn_enqueue_nammux_contact_contract_replays_v1", { _document_id: d.id, _replay_reason: "document_added_after_win" });
        if (e) return json({ error: "nammux_enqueue_failed" }, 500);
      }
    }
  }

  if (!seen) {
    const title = event === "document.sent" ? "Contrato enviado (SuvSign)"
      : event === "signatory.signed" ? `Contrato assinado por ${payload?.data?.signatory?.name ?? "signatário"}`
      : event === "document.completed" ? "Contrato concluído — PDF salvo" : `Evento SuvSign: ${event}`;
    await admin.from("activities").insert({
      organization_id: r.organization_id, opportunity_id: r.opportunity_id, contact_id: r.contact_id,
      activity_type: "system", title, body: r.template_name ?? null, source_external_id: logical,
    });
  }
  return json({ ok: true, duplicate: !!seen, delivery });
});

async function sync(admin: Any, r: Any, op: Any) {
  const status = mapOperationStatus(op?.status);
  const patch: Record<string, unknown> = {};
  if (status && status !== "draft") patch.status = status;
  if (status && status !== "draft" && !r.sent_at) patch.sent_at = op.sent_at ?? new Date().toISOString();
  if (status === "completed" && !r.completed_at) patch.completed_at = op.completed_at ?? new Date().toISOString();
  if (status === "cancelled" && !r.cancelled_at) patch.cancelled_at = op.cancelled_at ?? new Date().toISOString();
  if (Array.isArray(op?.documents)) {
    patch.provider_documents = op.documents.map((d: Any) => ({
      document_id: d.id, provider_document_id: d.document_id ?? null, ref: d.ref ?? null, title: d.title ?? null,
      status: d.render_status ?? null, content_sha256: d.content_sha256 ?? null, final_sha256: d.final_sha256 ?? null,
      verification_code: d.verification_code ?? null,
    }));
  }
  if (Object.keys(patch).length) await admin.from("signature_requests").update(patch).eq("id", r.id);
  for (const p of (Array.isArray(op?.participants) ? op.participants : [])) {
    if (!p?.ref) continue;
    await admin.from("signature_request_participants").update({
      provider_participant_id: p.id ?? null, status: p.status ?? "invited", opened_at: p.opened_at ?? null, signed_at: p.signed_at ?? null,
    }).eq("request_id", r.id).eq("ref", p.ref);
  }
}

async function storePdf(admin: Any, r: Any, payload: Any): Promise<{ ok: boolean; error?: string }> {
  const docId = String(payload?.data?.document_id ?? payload?.document?.id ?? "");
  const fileUrl = payload?.data?.signed_file_url ?? payload?.document?.signed_file_url;
  if (!docId || !fileUrl || !r.contact_id) return { ok: true };
  const { data: exists } = await admin.from("documents").select("id").eq("organization_id", r.organization_id)
    .eq("external_source", "suvsign_v2").eq("external_ref", docId).maybeSingle();
  if (exists) return { ok: true };
  let u: URL;
  try { u = new URL(fileUrl); } catch { return { ok: false, error: "invalid_file_url" }; }
  if (u.protocol !== "https:") return { ok: false, error: "invalid_file_url" };
  const res = await fetch(u.toString());
  if (!res.ok) return { ok: false, error: "pdf_download_failed" };
  const buf = new Uint8Array(await res.arrayBuffer());
  const title = String(payload?.data?.title ?? r.template_name ?? "Contrato").replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 120) || "Contrato";
  const path = `${r.contact_id}/suvsign_v2_${docId}.pdf`;
  const up = await admin.storage.from("attachments").upload(path, buf, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, error: "upload_failed" };
  const { error } = await admin.from("documents").insert({
    organization_id: r.organization_id, entity_type: "contact", entity_id: r.contact_id,
    file_name: `${title} - Assinado.pdf`, storage_path: path, bucket: "attachments", mime_type: "application/pdf",
    size_bytes: buf.byteLength, external_source: "suvsign_v2", external_ref: docId,
  });
  if (error && error.code !== "23505") return { ok: false, error: "document_insert_failed" };
  return { ok: true };
}
