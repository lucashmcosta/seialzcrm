// process-classification — Classificação de processos v1 (módulo por tenant: organization_widgets 'process_classification').
// Spec: docs/classificacao-v1/SPEC.md. O cálculo roda AQUI; o navegador do vendedor só recebe faixa + comissão.
//
// Ações (POST JSON):
//   { action: 'get_state', opportunity_id }                         → estado do widget (§5.1)
//   { action: 'classify', opportunity_id, entrada, idempotency_key } → grava e devolve faixa + comissão
//   { action: 'request_correction', opportunity_id }                → vendedor pede correção (§6); avisa quem libera
//   { action: 'decide_correction', opportunity_id, release, reason? } → gestor libera ou recusa (§6)
//   { action: 'certify', opportunity_id, entrada, note, dry_run?, redo? } → certificação pós-ganho (Fase 3b)
//
// LGPD (§7): nunca logar entrada, resultado nem calibração. Só ids e códigos.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  calcular, camposAlterados, chaveValida, decidirCertificacao, estadoDoWidget, MODULE_KEY, type Pedido, type Perms, podeCertificar,
  podeClassificar, podeLiberar, podeVerTodas, Recusa, recusaDaRpc, visaoVendedor,
} from "./logic.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const recusa = (r: Recusa) => json(r.status, { error: r.codigo, message: r.mensagem, ...(r.extra ?? {}) });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = body?.action;
  const opportunityId = body?.opportunity_id;
  if (!["get_state", "classify", "request_correction", "decide_correction", "certify"].includes(action)) return json(400, { error: "invalid_action" });
  if (typeof opportunityId !== "string" || !UUID.test(opportunityId)) return json(400, { error: "invalid_opportunity_id" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authErr } = await userClient.auth.getUser();
  if (authErr || !auth?.user) return json(401, { error: "unauthorized" });

  const db = createClient(url, service);
  const { data: me } = await db.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!me?.id) return json(401, { error: "unauthorized" });

  const { data: opp } = await db.from("opportunities")
    .select("id, organization_id, owner_user_id, status, deleted_at").eq("id", opportunityId).maybeSingle();
  if (!opp || opp.deleted_at) return json(404, { error: "not_found" });
  const org = opp.organization_id as string;

  const { data: membership } = await db.from("user_organizations").select("id, permission_profile_id")
    .eq("user_id", me.id).eq("organization_id", org).eq("is_active", true).maybeSingle();
  if (!membership) return json(403, { error: "forbidden" });

  const { data: widget } = await db.from("organization_widgets").select("is_enabled")
    .eq("organization_id", org).eq("widget_key", MODULE_KEY).maybeSingle();
  if (widget?.is_enabled !== true) return json(403, { error: "module_disabled" });

  const { data: permsData } = await db.rpc("pc_user_perms", { _org: org, _user: me.id });
  const perms = (permsData ?? null) as Perms;
  const isOwner = opp.owner_user_id === me.id;
  // Refazer certificação: só o Admin (perfil de sistema). Consulta direta, sem depender de embed do PostgREST.
  const { data: perfil } = membership.permission_profile_id
    ? await db.from("permission_profiles").select("is_system").eq("id", membership.permission_profile_id).maybeSingle()
    : { data: null };
  const isSystemAdmin = perfil?.is_system === true;

  try {
    if (action === "get_state") {
      const liberador = podeLiberar(perms) && !isOwner;
      const certificador = podeCertificar(perms);
      if (!isOwner && !podeVerTodas(perms) && !liberador && !certificador) return json(403, { error: "forbidden" });
      const { data: ativa } = await db.from("process_classifications")
        .select("id, band, commission, in_review, created_at, input, seller_user_id").eq("opportunity_id", opportunityId).eq("status", "active").maybeSingle();
      let pedido: Pedido | null = null;
      if (ativa) {
        const { data } = await db.from("classification_correction_requests")
          .select("status, created_at, reason, replacement_id").eq("classification_id", ativa.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        pedido = (data ?? null) as Pedido | null;
      }
      const estado = estadoDoWidget(opp.status === "open", ativa ?? null, pedido);
      const aberta = opp.status === "open";
      const podeDecidir = aberta && liberador && pedido?.status === "pending" && ativa?.seller_user_id !== me.id;
      const { data: cert } = ativa
        ? await db.from("process_classification_certifications")
          .select("outcome, original_band, original_commission, final_band, final_commission, note, created_at, source, input")
          .eq("classification_id", ativa.id).eq("status", "active").maybeSingle()
        : { data: null };
      const podeCertificarAgora = opp.status === "won" && !!ativa && certificador && (!cert || isSystemAdmin);
      return json(200, {
        estado,
        podeClassificar: isOwner && podeClassificar(perms),
        podePedirCorrecao: aberta && !!ativa && ativa.seller_user_id === me.id && (estado === "classificada" || estado === "pedido_recusado" || estado === "em_revisao"),
        podeDecidir,
        // o resultado é do vendedor que classificou; para os outros a tela não diz "sua comissão"
        doVendedor: !!ativa && ativa.seller_user_id === me.id,
        classificacao: ativa ? { id: ativa.id, ...visaoVendedor(ativa) } : null,
        pedido: pedido ? { status: pedido.status, criadoEm: pedido.created_at, motivo: pedido.reason } : null,
        // §6.2: para decidir, o gestor vê as respostas do vendedor (a Entrada não tem números calculados).
        respostas: podeDecidir || podeCertificarAgora ? (cert?.input ?? ativa?.input ?? null) : null,
        podeCertificar: podeCertificarAgora,
        refazendoCertificacao: podeCertificarAgora && !!cert,
        certificacao: cert ? {
          resultado: cert.outcome, motivo: cert.note, certificadoEm: cert.created_at, origem: cert.source,
          original: { faixa: cert.original_band, comissao: Number(cert.original_commission) },
          final: { faixa: cert.final_band, comissao: Number(cert.final_commission) },
        } : null,
      });
    }

    if (action === "certify") {
      if (!podeCertificar(perms)) return json(403, { error: "forbidden" });
      if (opp.status !== "won") return recusa(recusaDaRpc("pc:not_won"));
      const { data: ativa } = await db.from("process_classifications")
        .select("id, band, commission, input, calibration_version_id").eq("opportunity_id", opportunityId).eq("status", "active").maybeSingle();
      if (!ativa) return recusa(recusaDaRpc("pc:not_classified"));
      const redo = body?.redo === true;
      if (redo && !isSystemAdmin) return json(403, { error: "forbidden", message: "Só o Admin pode refazer uma certificação." });
      // Mesma versão de calibração usada pelo vendedor: a comparação é justa mesmo se a calibração mudou depois.
      const { data: cal } = await db.from("classification_calibration_versions")
        .select("id, content, motor_version").eq("id", ativa.calibration_version_id).single();
      const { entrada, resultado } = calcular(body?.entrada, cal!);
      const mudou = camposAlterados(ativa.input as Record<string, unknown>, entrada);
      const original = { faixa: ativa.band as string | null, comissao: Number(ativa.commission) };
      const certificada = { faixa: resultado.faixa as string | null, comissao: Number(resultado.comissao) };
      const decisao = decidirCertificacao(original, certificada);
      if (body?.dry_run === true) {
        return json(200, { original, certificada, final: decisao.final, resultado: decisao.resultado, mudou });
      }
      const note = typeof body?.note === "string" ? body.note.slice(0, 1000) : "";
      const { data, error } = await db.rpc("pc_record_certification", {
        _org: org, _opp: opportunityId, _source: "seialz", _actor: me.id, _external_actor: null, _external_event_id: null,
        _input: entrada, _changed: mudou, _result: resultado, _note: note, _redo: redo,
      });
      if (error) return recusa(recusaDaRpc(error.message ?? ""));
      const r = data as { outcome: string; finalBand: string | null; finalCommission: number; certifiedAt: string };
      return json(200, { resultado: r.outcome, final: { faixa: r.finalBand, comissao: Number(r.finalCommission) }, certificadoEm: r.certifiedAt, mudou });
    }

    if (action === "request_correction") {
      const { data, error } = await db.rpc("pc_request_correction", { _org: org, _opp: opportunityId, _seller: me.id });
      if (error) return recusa(recusaDaRpc(error.message ?? ""));
      return json(200, { criadoEm: (data as { criadoEm: string }).criadoEm });
    }

    if (action === "decide_correction") {
      if (!podeLiberar(perms)) return json(403, { error: "forbidden" });
      const release = body?.release === true;
      const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
      const { data, error } = await db.rpc("pc_decide_correction", { _org: org, _opp: opportunityId, _manager: me.id, _release: release, _reason: reason });
      if (error) return recusa(recusaDaRpc(error.message ?? ""));
      return json(200, data as Record<string, unknown>);
    }

    // classify
    if (!podeClassificar(perms)) return json(403, { error: "forbidden" });
    if (!isOwner) return recusa(recusaDaRpc("pc:not_owner"));
    if (opp.status !== "open") return recusa(recusaDaRpc("pc:opportunity_closed"));
    const key = body?.idempotency_key;
    if (!chaveValida(key)) return json(400, { error: "invalid_idempotency_key" });

    const { data: cal } = await db.from("classification_calibration_versions")
      .select("id, content, motor_version").eq("organization_id", org).eq("status", "published").maybeSingle();
    if (!cal) return json(409, { error: "no_calibration", message: "O módulo ainda não tem calibração publicada. Fale com o administrador." });

    const { entrada, resultado, motorVersao } = calcular(body?.entrada, cal);
    const { data: gravado, error: rpcErr } = await db.rpc("pc_record_classification", {
      _org: org, _opp: opportunityId, _seller: me.id, _key: key, _calibration_id: cal.id,
      _motor_version: motorVersao, _input: entrada, _result: resultado,
    });
    if (rpcErr) {
      const r = recusaDaRpc(rpcErr.message ?? "");
      if (r.status >= 500) console.error("[process-classification] rpc_error", { opportunityId, code: rpcErr.code });
      return recusa(r);
    }
    const g = gravado as { id: string; faixa: string | null; comissao: number; emRevisao: boolean; classificadoEm: string };
    return json(200, { id: g.id, faixa: g.faixa, comissao: Number(g.comissao), emRevisao: g.emRevisao, classificadoEm: g.classificadoEm });
  } catch (e) {
    if (e instanceof Recusa) return recusa(e);
    console.error("[process-classification] unexpected", { opportunityId, action, err: e instanceof Error ? e.name : "unknown" });
    return json(500, { error: "internal_error" });
  }
});
