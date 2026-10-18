// process-classification-admin — calibração da classificação de processos (Fase 4, SPEC §8).
// Tudo que calcula roda aqui com o mesmo motor.mjs do vendedor: o navegador do admin recebe números e resultados,
// mas nunca o motor nem a semente. Permissões RBAC v2: administracao.calibrar_classificacao / publicar_calibracao.
//
// POST JSON { action, organization_id, ... }:
//   workspace                                   → publicada, rascunho, histórico, catálogo, permissões
//   save_draft     { content, expected_updated_at }  (calibrar)
//   discard_draft                                (calibrar)
//   check          { content? }                  (calibrar)  problemas, o que mudou, matriz faixa × score
//   simulate       { entrada, content? }         (calibrar)  resultado completo
//   impact_preview { content?, days? }           (calibrar)  recálculo das classificações ativas (não grava)
//   import         { content, expected_updated_at }  (calibrar)  vira rascunho; lista o que foi ignorado
//   restore        { version_id | "padrao", expected_updated_at }  (publicar)  vira rascunho
//   publish        { note, expected_updated_at }  (publicar)
//   version_diff   { version_id }                o que mudou em relação à versão anterior
// LGPD: não loga calibração, entradas nem resultados.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  CALIBRACAO_PADRAO, type Cal, CATALOGO, comparar, conferir, type LinhaImpacto, matrizFaixas, MOTOR_VERSAO, normalizarRascunho,
  podeCalibrar, podePublicar, previaImpacto, Recusa, simular,
} from "./logic.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const recusa = (r: Recusa) => json(r.status, { error: r.codigo, message: r.mensagem, ...(r.extra ?? {}) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACOES = ["workspace", "save_draft", "discard_draft", "check", "simulate", "impact_preview", "import", "restore", "publish", "version_diff"];
const ERROS_RPC: Record<string, [number, string]> = {
  draft_conflict: [409, "Outra pessoa alterou a calibração enquanto você editava. Recarregue para ver a versão mais recente."],
  note_required: [422, "Escreva uma nota explicando o que mudou."],
  no_draft: [409, "Não há rascunho para publicar."],
};
const recusaRpc = (msg: string) => {
  const code = /pc:([a-z_]+)/.exec(msg)?.[1] ?? "erro";
  const [st, m] = ERROS_RPC[code] ?? [500, "Não foi possível concluir. Tente de novo."];
  return new Recusa(st, code, m);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = body?.action, org = body?.organization_id;
  if (!ACOES.includes(action)) return json(400, { error: "invalid_action" });
  if (typeof org !== "string" || !UUID.test(org)) return json(400, { error: "invalid_organization_id" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authErr } = await userClient.auth.getUser();
  if (authErr || !auth?.user) return json(401, { error: "unauthorized" });
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await db.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!me?.id) return json(401, { error: "unauthorized" });
  const { data: membership } = await db.from("user_organizations").select("id")
    .eq("user_id", me.id).eq("organization_id", org).eq("is_active", true).maybeSingle();
  if (!membership) return json(403, { error: "forbidden" });
  const { data: permsData } = await db.rpc("pc_user_perms", { _org: org, _user: me.id });
  const calibra = podeCalibrar(permsData), publica = podePublicar(permsData);
  if (!calibra && !publica) return json(403, { error: "forbidden" });
  const exige = (ok: boolean) => { if (!ok) throw new Recusa(403, "forbidden", "Você não tem permissão para esta ação."); };

  const versoes = async () => {
    const { data } = await db.from("classification_calibration_versions")
      .select("id, number, status, content, motor_version, note, created_at, published_at, published_by, created_by, based_on_id, updated_at")
      .eq("organization_id", org).order("number", { ascending: false });
    return data ?? [];
  };
  const salvar = async (content: Cal, expected: unknown) => {
    const { data, error } = await db.rpc("pc_save_draft", {
      _org: org, _content: content, _actor: me.id, _expected_updated_at: typeof expected === "string" ? expected : null, _motor_version: MOTOR_VERSAO,
    });
    if (error) throw recusaRpc(error.message ?? "");
    return data as { id: string; number: number; updatedAt: string };
  };

  try {
    const vs = await versoes();
    const publicada = vs.find((v) => v.status === "published") ?? null;
    const rascunho = vs.find((v) => v.status === "draft") ?? null;
    const base = (publicada?.content ?? CALIBRACAO_PADRAO) as Cal;
    // conteúdo de trabalho: o enviado (ainda não salvo) > rascunho > publicada
    const trabalho = () => (body?.content ? normalizarRascunho(body.content, base).calibracao : ((rascunho?.content ?? base) as Cal));

    switch (action) {
      case "workspace": {
        const ids = [...new Set(vs.flatMap((v) => [v.published_by, v.created_by]).filter(Boolean))];
        const { data: pessoas } = ids.length ? await db.from("users").select("id, full_name").in("id", ids) : { data: [] };
        const nome = (id: string | null) => (pessoas ?? []).find((p) => p.id === id)?.full_name ?? null;
        return json(200, {
          motorVersao: MOTOR_VERSAO, podeCalibrar: calibra, podePublicar: publica, catalogo: CATALOGO,
          publicada: publicada && { id: publicada.id, numero: publicada.number, conteudo: publicada.content, nota: publicada.note, publicadaEm: publicada.published_at },
          rascunho: rascunho && { id: rascunho.id, numero: rascunho.number, conteudo: rascunho.content, atualizadoEm: rascunho.updated_at },
          historico: vs.filter((v) => v.status !== "draft").map((v) => ({
            id: v.id, numero: v.number, status: v.status, nota: v.note, publicadaEm: v.published_at, publicadaPor: nome(v.published_by),
            motorVersao: v.motor_version, conteudo: v.content,
          })),
        });
      }
      case "save_draft": {
        exige(calibra);
        const { calibracao, ignorados } = normalizarRascunho(body?.content, base);
        const r = await salvar(calibracao, body?.expected_updated_at);
        return json(200, { numero: r.number, atualizadoEm: r.updatedAt, ignorados });
      }
      case "discard_draft": {
        exige(calibra);
        await db.rpc("pc_discard_draft", { _org: org });
        return json(200, { ok: true });
      }
      case "check": {
        exige(calibra);
        const cal = trabalho();
        return json(200, { problemas: conferir(cal), mudancas: comparar(base, cal), matriz: matrizFaixas(cal) });
      }
      case "simulate": {
        exige(calibra);
        const { entrada, resultado } = simular(body?.entrada, trabalho());
        return json(200, { entrada, resultado });
      }
      case "impact_preview": {
        exige(calibra);
        const dias = Math.min(365, Math.max(1, Number(body?.days) || 90));
        const desde = new Date(Date.now() - dias * 86400_000).toISOString();
        const { data: linhas } = await db.from("process_classifications")
          .select("id, opportunity_id, seller_user_id, input, band, commission")
          .eq("organization_id", org).eq("status", "active").gte("created_at", desde).limit(5000);
        const r = previaImpacto((linhas ?? []).map((l): LinhaImpacto => ({
          classificationId: l.id, opportunityId: l.opportunity_id, sellerId: l.seller_user_id, input: l.input,
          band: l.band, commission: Number(l.commission),
        })), trabalho());
        const ids = r.porVendedor.map((v) => v.sellerId);
        const { data: pessoas } = ids.length ? await db.from("users").select("id, full_name").in("id", ids) : { data: [] };
        return json(200, {
          dias, ...r,
          porVendedor: r.porVendedor.map((v) => ({ ...v, nome: (pessoas ?? []).find((p) => p.id === v.sellerId)?.full_name ?? "—" })),
        });
      }
      case "import": {
        exige(calibra);
        const { calibracao, aplicados, ignorados } = normalizarRascunho(body?.content, base);
        const r = await salvar(calibracao, body?.expected_updated_at ?? (rascunho ? rascunho.updated_at : null));
        return json(200, { numero: r.number, atualizadoEm: r.updatedAt, aplicados, ignorados });
      }
      case "restore": {
        exige(publica);
        const origem = body?.version_id === "padrao" ? CALIBRACAO_PADRAO : (vs.find((v) => v.id === body?.version_id)?.content as Cal | undefined);
        if (!origem) return json(404, { error: "not_found" });
        const { calibracao } = normalizarRascunho(origem, base);
        const r = await salvar(calibracao, body?.expected_updated_at ?? (rascunho ? rascunho.updated_at : null));
        return json(200, { numero: r.number, atualizadoEm: r.updatedAt });
      }
      case "publish": {
        exige(publica);
        if (!rascunho) throw recusaRpc("pc:no_draft");
        const cal = rascunho.content as Cal;
        const problemas = conferir(cal);
        if (problemas.length) return json(422, { error: "invalid_calibration", message: "A calibração tem problemas e não pode ser publicada.", problemas });
        if (publicada && comparar(publicada.content as Cal, cal).length === 0) {
          return json(409, { error: "nothing_changed", message: "O rascunho é igual à versão publicada." });
        }
        const { data, error } = await db.rpc("pc_publish_calibration", {
          _org: org, _actor: me.id, _note: typeof body?.note === "string" ? body.note.slice(0, 1000) : "", _expected_updated_at: body?.expected_updated_at ?? null,
        });
        if (error) throw recusaRpc(error.message ?? "");
        return json(200, { numero: (data as { number: number }).number });
      }
      case "version_diff": {
        const v = vs.find((x) => x.id === body?.version_id);
        if (!v) return json(404, { error: "not_found" });
        const anterior = vs.filter((x) => x.status !== "draft" && x.number < v.number).sort((a, b) => b.number - a.number)[0];
        return json(200, { numero: v.number, anterior: anterior?.number ?? null,
          mudancas: anterior ? comparar(anterior.content as Cal, v.content as Cal) : [] });
      }
    }
    return json(400, { error: "invalid_action" });
  } catch (e) {
    if (e instanceof Recusa) return recusa(e);
    console.error("[process-classification-admin] unexpected", { action, err: e instanceof Error ? e.name : "unknown" });
    return json(500, { error: "internal_error" });
  }
});
