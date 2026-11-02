// plamev-quote — Cotação de planos pet da Plamev dentro do Seialz (widget 'plamev_quote').
// Cada org cola o próprio token da API da Plamev (tabela plamev_credentials, cifrado); o navegador nunca vê o token
// nem fala com a API deles.
//
// Ações (POST JSON, sempre com organization_id):
//   { action: 'estados' }                                   → UFs atendidas
//   { action: 'cidades', estado_id }                        → cidades do estado
//   { action: 'racas', especie: '1'|'2' }                   → raças (1 gato, 2 cachorro)
//   { action: 'planos', estado_id }                         → planos com preço "a partir de" na região
//   { action: 'campanhas', estado_id, tipo_id }             → campanhas de desconto do tipo de plano, com tabelas
//   { action: 'cupom', estado_id, tipo_id, cupom }          → { valido, mensagem }
//   { action: 'simular', ...pedido }                        → valores sem gravar nada na Plamev
//   { action: 'solicitar', ...pedido, cliente, opportunity_id?, resumo_pets? }
//                                                           → grava a cotação na Plamev; com oportunidade, salva em
//                                                             plamev_quotes e põe nota na linha do tempo
//   { action: 'contexto', opportunity_id?, contact_id? }    → dados do contato para preencher + cotações da oportunidade
//   { action: 'config_get' }                                → { configurado, final, atualizadoEm }
//   { action: 'config_set', token }                         → testa o token na Plamev e grava
//   { action: 'config_delete' }                             → remove o token
//
// Acesso: usuário ativo na org. Cotação exige widget ligado; config_* exige can_manage_settings.
// LGPD: nunca logar token, dados do cliente nem do pet. Só ação, org e status.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../_shared/integration-credentials.ts";
import * as L from "./logic.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const BASE = (Deno.env.get("PLAMEV_API_BASE") ?? "https://service.plamev.com.br").replace(/\/+$/, "");
const CONSULTOR = Deno.env.get("PLAMEV_CONSULTOR_ID")?.trim() || null;

// Catálogo muda pouco: guarda por 1h na instância, por org (tokens diferentes podem ver campanhas diferentes).
const cache = new Map<string, { ate: number; valor: unknown }>();
const UMA_HORA = 60 * 60 * 1000;

// deno-lint-ignore no-explicit-any
async function plamev(token: string, path: string, init?: { body?: unknown; cacheOrg?: string }): Promise<any> {
  const chave = init?.cacheOrg ? `${init.cacheOrg}:${path}` : null;
  const hit = chave ? cache.get(chave) : undefined;
  if (hit && hit.ate > Date.now()) return hit.valor;

  const res = await fetch(`${BASE}/${path}`, {
    method: init?.body ? "POST" : "GET",
    headers: { Authorization: token, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const texto = await res.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    console.warn(`[plamev-quote] ${path.split("?")[0]} -> ${res.status}`);
    if (res.status === 401) throw new L.Recusa(502, "plamev_unauthorized", "Token da Plamev recusado");
    throw new L.Recusa(res.status === 400 ? 422 : 502, "plamev_error", L.erroPlamev(dados));
  }
  if (chave) cache.set(chave, { ate: Date.now() + UMA_HORA, valor: dados });
  return dados;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const action = body?.action as L.Action;
  if (!L.ACTIONS.includes(action)) return json(400, { error: "invalid_action" });

  let org: string;
  try { org = L.guid(body?.organization_id, "organization_id"); } catch (e) { return json(400, { error: (e as L.Recusa).codigo }); }

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authErr } = await userClient.auth.getUser();
  if (authErr || !auth?.user) return json(401, { error: "unauthorized" });

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await db.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!me?.id) return json(401, { error: "unauthorized" });

  const { data: membership } = await db.from("user_organizations").select("id, permission_profile_id")
    .eq("user_id", me.id).eq("organization_id", org).eq("is_active", true).maybeSingle();
  if (!membership) return json(403, { error: "forbidden" });

  try {
    if (L.CONFIG_ACTIONS.includes(action)) {
      const { data: perfil } = membership.permission_profile_id
        ? await db.from("permission_profiles").select("permissions").eq("id", membership.permission_profile_id).maybeSingle()
        : { data: null };
      if ((perfil?.permissions as Record<string, unknown> | null)?.can_manage_settings !== true) {
        return json(403, { error: "can_manage_settings_required" });
      }

      if (action === "config_get") {
        const { data } = await db.from("plamev_credentials").select("token_last4, updated_at").eq("organization_id", org).maybeSingle();
        return json(200, { configurado: !!data, final: data?.token_last4 ?? null, atualizadoEm: data?.updated_at ?? null });
      }
      if (action === "config_delete") {
        await db.from("plamev_credentials").delete().eq("organization_id", org);
        for (const k of cache.keys()) if (k.startsWith(`${org}:`)) cache.delete(k);
        console.log(`[plamev-quote] token removido org=${org} user=${me.id}`);
        return json(200, { configurado: false });
      }
      // config_set: só grava token que a Plamev aceita (lista de estados é a chamada mais leve).
      const token = L.tokenColado(body.token);
      try {
        await plamev(token, "Estados/consultar");
      } catch (e) {
        if (e instanceof L.Recusa && e.codigo === "plamev_unauthorized") return json(422, { error: "token_rejected" });
        throw e;
      }
      const { error } = await db.from("plamev_credentials").upsert({
        organization_id: org,
        token_ciphertext: await encryptIntegrationSecret(token),
        token_last4: token.slice(-4),
        updated_by_user_id: me.id,
      });
      if (error) throw new Error(`credential_save_failed: ${error.code}`);
      for (const k of cache.keys()) if (k.startsWith(`${org}:`)) cache.delete(k);
      console.log(`[plamev-quote] token salvo org=${org} user=${me.id}`);
      return json(200, { configurado: true, final: token.slice(-4) });
    }

    const { data: widget } = await db.from("organization_widgets").select("is_enabled")
      .eq("organization_id", org).eq("widget_key", L.MODULE_KEY).maybeSingle();
    if (widget?.is_enabled !== true) return json(403, { error: "module_disabled" });

    // Oportunidade/contato lidos com o JWT do usuário: valem as regras de visibilidade (RLS) do CRM.
    const oportunidade = async (id: unknown) => {
      if (id == null) return null;
      const oppId = L.guid(id, "opportunity_id");
      const { data } = await userClient.from("opportunities").select("id, organization_id, contact_id, deleted_at")
        .eq("id", oppId).maybeSingle();
      if (!data || data.deleted_at || data.organization_id !== org) throw new L.Recusa(404, "opportunity_not_found");
      return data as { id: string; contact_id: string | null };
    };

    if (action === "contexto") {
      const opp = await oportunidade(body.opportunity_id);
      const contatoId = opp?.contact_id ?? (body.contact_id != null ? L.guid(body.contact_id, "contact_id") : null);
      const { data: contato } = contatoId
        ? await userClient.from("contacts")
          .select("full_name, first_name, last_name, email, phone, cpf, address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, organization_id, deleted_at")
          .eq("id", contatoId).maybeSingle()
        : { data: null };
      const contatoOk = contato && !contato.deleted_at && contato.organization_id === org;
      const { data: cotacoes } = opp
        ? await db.from("plamev_quotes")
          .select("numero_cotacao, link_pagamento, forma_pagamento, valor_mensalidade, valor_adesao, pets, created_at")
          .eq("organization_id", org).eq("opportunity_id", opp.id).order("created_at", { ascending: false }).limit(20)
        : { data: [] };
      return json(200, {
        cliente: contatoOk ? L.clienteDoContato(contato) : null,
        cotacoes: (cotacoes ?? []).map((c) => ({
          numeroCotacao: c.numero_cotacao, linkPagamento: c.link_pagamento, formaPagamento: c.forma_pagamento,
          mensalidade: Number(c.valor_mensalidade), adesao: Number(c.valor_adesao), pets: c.pets, criadaEm: c.created_at,
        })),
      });
    }

    const { data: cred } = await db.from("plamev_credentials").select("token_ciphertext").eq("organization_id", org).maybeSingle();
    if (!cred) return json(409, { error: "plamev_not_configured" });
    const token = await decryptIntegrationSecret(cred.token_ciphertext);
    const cat = { cacheOrg: org };

    switch (action) {
      case "estados":
        return json(200, { estados: L.estados(await plamev(token, "Estados/consultar", cat)) });

      case "cidades": {
        const estado = L.guid(body.estado_id, "estado_id");
        return json(200, { cidades: L.cidades(await plamev(token, `Cidades/consultar?${q({ EstadosId: estado })}`, cat)) });
      }

      case "racas": {
        if (body.especie !== "1" && body.especie !== "2") return json(400, { error: "invalid_especie" });
        return json(200, { racas: L.racas(await plamev(token, `Racas/consultar?${q({ Especie: body.especie })}`, cat)) });
      }

      case "planos": {
        const estado = L.guid(body.estado_id, "estado_id");
        const raw = await plamev(token,
          `Coberturas/BuscarCoberturasComPreco?${q({ EstadosId: estado, Cidades: "NULL", Valores: "true", order: "Ordem" })}`, cat);
        return json(200, { planos: L.planos(raw) });
      }

      case "campanhas": {
        const estado = L.guid(body.estado_id, "estado_id");
        const tipo = String(body.tipo_id ?? "");
        if (!/^\d{1,4}$/.test(tipo)) return json(400, { error: "invalid_tipo_id" });
        const lista = L.campanhas(await plamev(token,
          `CampanhasCoberturas/BuscarCampanhasCoberturas?${q({ TiposCoberturasId: tipo, EstadosId: estado })}`, cat));
        const comTabelas = await Promise.all(lista.slice(0, 30).map(async (c) => ({
          ...c,
          tabelas: L.tabelas(await plamev(token,
            `CampanhasCoberturasTabelas/BuscarCampanhasCoberturasTabelas?${q({ CampanhasCoberturasId: c.id })}`, cat)),
        })));
        return json(200, { campanhas: comTabelas.filter((c) => c.tabelas.length > 0) });
      }

      case "cupom": {
        const estado = L.guid(body.estado_id, "estado_id");
        const tipo = String(body.tipo_id ?? "");
        const cupom = typeof body.cupom === "string" ? body.cupom.trim() : "";
        if (!/^\d{1,4}$/.test(tipo)) return json(400, { error: "invalid_tipo_id" });
        if (!cupom || cupom.length > 40) return json(400, { error: "invalid_cupom" });
        try {
          await plamev(token, `CampanhasCoberturas/ValidarCupom?${q({ Cupom: cupom, TiposCoberturasId: tipo, EstadosId: estado })}`);
          return json(200, { valido: true });
        } catch (e) {
          // Cupom inválido volta como 400 da Plamev; não é falha do widget.
          if (e instanceof L.Recusa && e.codigo === "plamev_error") return json(200, { valido: false, mensagem: e.message });
          throw e;
        }
      }

      case "simular": {
        const pedido = L.pedidoSimulacao(body);
        const raw = await plamev(token, "Cotacoes/SimulaCotacaoPet", { body: L.corpoSimulacao(pedido, CONSULTOR) });
        return json(200, { resultado: L.resultado(raw) });
      }

      case "solicitar": {
        const pedido = L.pedidoSimulacao(body);
        const cliente = L.cliente(body);
        // Confere a oportunidade ANTES de gravar na Plamev: sem acesso, não cria cotação lá.
        const opp = await oportunidade(body.opportunity_id);
        const raw = await plamev(token, "Cotacoes/SolicitaCotacaoPet", { body: L.corpoCotacao(pedido, cliente, CONSULTOR) });
        const r = L.resultado(raw);
        console.log(`[plamev-quote] cotação gravada org=${org} user=${me.id} opp=${opp?.id ?? "-"}`);

        let salvaNaOportunidade = false;
        if (opp && r.numeroCotacao) {
          const pets = (Array.isArray(body.resumo_pets) ? body.resumo_pets : []).slice(0, 10).map((p: { nome?: unknown; plano?: unknown }) => ({
            nome: typeof p?.nome === "string" ? p.nome.trim().slice(0, 60) : "",
            plano: typeof p?.plano === "string" ? p.plano.trim().slice(0, 80) : "",
          }));
          // A cotação já existe na Plamev; falha aqui não pode esconder o número/link do vendedor.
          const { error: e1 } = await db.from("plamev_quotes").insert({
            organization_id: org, opportunity_id: opp.id, numero_cotacao: r.numeroCotacao, plamev_cotacao_id: r.cotacaoId,
            link_pagamento: r.linkPagamento, forma_pagamento: pedido.formaPagamento,
            valor_mensalidade: r.totalMensalidade, valor_adesao: r.adesao, pets, created_by_user_id: me.id,
          });
          const nota = L.notaCotacao(r, pets, pedido.formaPagamento);
          const { error: e2 } = await db.from("activities").insert({
            organization_id: org, opportunity_id: opp.id, contact_id: opp.contact_id, activity_type: "note",
            title: nota.title, body: nota.body, created_by_user_id: me.id,
          });
          if (e1 || e2) console.error(`[plamev-quote] salvar na oportunidade falhou opp=${opp.id} quotes=${e1?.code ?? "ok"} activity=${e2?.code ?? "ok"}`);
          salvaNaOportunidade = !e1;
        }
        return json(200, { resultado: r, salvaNaOportunidade });
      }
    }
  } catch (e) {
    if (e instanceof L.Recusa) return json(e.status, { error: e.codigo, message: e.message });
    console.error(`[plamev-quote] ${action} falhou: ${(e as Error).name}`);
    return json(502, { error: "plamev_unavailable" });
  }
  return json(400, { error: "invalid_action" });
});
