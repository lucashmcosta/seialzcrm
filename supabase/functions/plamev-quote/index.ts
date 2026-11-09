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
//                                                             (sem oportunidade: das oportunidades do contato)
//   { action: 'rede', cep, raio_km? }                       → rede credenciada perto do CEP (1 a 50 km, padrão 5)
//   { action: 'pagamento', opportunity_id?, contact_id? }   → consulta na Plamev se as cotações viraram venda/foram pagas
//   { action: 'materiais' }                                 → materiais de apoio da Plamev (iguais para todas as orgs;
//                                                             mantidos em /admin/plamev-materiais) para enviar na conversa
//   { action: 'perguntar', pergunta?, usar_conversa?, thread_id? }
//                                                           → resposta sugerida pela IA (Claude, chave da própria org)
//                                                             lendo os materiais e, se pedido, a conversa; ver perguntar.ts
//   { action: 'config_get' }                                → { configurado, final, atualizadoEm, marcarGanhaAoPagar }
//   { action: 'config_set', token }                         → testa o token na Plamev e grava
//   { action: 'config_delete' }                             → remove o token
//   { action: 'config_opcoes', marcar_ganha_ao_pagar }      → liga/desliga marcar a oportunidade como ganha ao pagar
//   { action: 'pagamentos_cron' }                           → só service_role (pg_cron a cada 15 min): confere as
//                                                             cotações não pagas dos últimos 60 dias de todas as orgs
//
// Pagamento: a Plamev não tem webhook. Com a adesão paga, uma nota vai para a linha do tempo (uma vez só) e, se a org
// ligou a opção, a oportunidade aberta vai para a etapa "ganho" pelo transition_opportunity_stage_v1 (respeita as
// regras de fechamento da org; bloqueada, só fica a nota).
//
// Acesso: usuário ativo na org. Cotação exige widget ligado; config_* exige can_manage_settings.
// LGPD: nunca logar token, dados do cliente nem do pet. Só ação, org e status.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { validateServiceRoleAuth } from "../_shared/auth.ts";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../_shared/integration-credentials.ts";
import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";
import { decryptSecret } from "../_shared/crypto.ts";
import { logAiUsage } from "../_shared/intelligence/log-usage.ts";
import { estimateTextCostUsd } from "../_shared/intelligence/pricing.ts";
import { byokBudgetExceeded, markByokInvalid, readSecretPayload } from "../_shared/intelligence/resolve-provider.ts";
import { pickTextAiCredential, type LegacyAiRow } from "../_shared/intelligence/text-ai-credential.ts";
import * as L from "./logic.ts";
import * as P from "./perguntar.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const BASE = (Deno.env.get("PLAMEV_API_BASE") ?? "https://service.plamev.com.br").replace(/\/+$/, "");
const CONSULTOR = Deno.env.get("PLAMEV_CONSULTOR_ID")?.trim() || null;

// Catálogo muda pouco: guarda por 1h na instância, por org (tokens diferentes podem ver campanhas diferentes).
const cache = new Map<string, { ate: number; valor: unknown }>();
const UMA_HORA = 60 * 60 * 1000;

async function plamev(
  token: string,
  path: string,
  // naoEncontrado: 404 da Plamev ("Cotação não localizada", "Nenhum registro encontrado") devolve null em vez de erro.
  init?: { body?: unknown; cacheOrg?: string; trace?: Chamada[]; naoEncontrado?: boolean },
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const chave = init?.cacheOrg ? `${init.cacheOrg}:${path}${init.body ? `:${JSON.stringify(init.body)}` : ""}` : null;
  const hit = chave ? cache.get(chave) : undefined;
  if (hit && hit.ate > Date.now()) return hit.valor;

  const inicio = Date.now();
  const res = await fetch(`${BASE}/${path}`, {
    method: init?.body ? "POST" : "GET",
    headers: { Authorization: token, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const texto = await res.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  // Sem o token: só o que foi enviado e o que voltou, para o vendedor conferir com a Plamev.
  init?.trace?.push({
    metodo: init?.body ? "POST" : "GET", url: `${BASE}/${path}`, status: res.status, ms: Date.now() - inicio,
    enviado: init?.body ?? null, recebido: dados ?? (texto ? texto.slice(0, 20_000) : null),
  });
  if (res.status === 404 && init?.naoEncontrado) return null;
  if (!res.ok) {
    console.warn(`[plamev-quote] ${path.split("?")[0]} -> ${res.status}`);
    if (res.status === 401) throw new L.Recusa(502, "plamev_unauthorized", "Token da Plamev recusado");
    throw new L.Recusa(res.status === 400 ? 422 : 502, "plamev_error", L.erroPlamev(dados));
  }
  if (chave) cache.set(chave, { ate: Date.now() + UMA_HORA, valor: dados });
  return dados;
}

/** Uma chamada à API da Plamev, devolvida ao widget em simular/solicitar ("Ver payload"). */
interface Chamada { metodo: string; url: string; status: number; ms: number; enviado: unknown; recebido: unknown }

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

// deno-lint-ignore no-explicit-any
type Db = any;

const COLUNAS_COTACAO = "id, organization_id, opportunity_id, numero_cotacao, plamev_cotacao_id, link_pagamento, forma_pagamento, "
  + "valor_mensalidade, valor_adesao, pets, created_at, virou_venda, adesao_paga, adesao_situacao, venda_situacao, adesao_pago_em, "
  + "status_verificado_em, pagamento_registrado_em";

interface CotacaoLinha {
  id: string; organization_id: string; opportunity_id: string; numero_cotacao: string; plamev_cotacao_id: string;
  link_pagamento: string | null; forma_pagamento: 1 | 2; valor_mensalidade: number; valor_adesao: number; pets: unknown;
  created_at: string; virou_venda: boolean; adesao_paga: boolean; adesao_situacao: string | null; venda_situacao: string | null;
  adesao_pago_em: string | null; status_verificado_em: string | null; pagamento_registrado_em: string | null;
}

const cotacaoParaWidget = (c: CotacaoLinha) => ({
  numeroCotacao: c.numero_cotacao, linkPagamento: c.link_pagamento, formaPagamento: c.forma_pagamento,
  mensalidade: Number(c.valor_mensalidade), adesao: Number(c.valor_adesao), pets: c.pets, criadaEm: c.created_at,
  pagamento: {
    virouVenda: c.virou_venda, adesaoPaga: c.adesao_paga, adesaoSituacao: c.adesao_situacao, vendaSituacao: c.venda_situacao,
    pagoEm: c.adesao_pago_em, verificadoEm: c.status_verificado_em,
  },
});

/** Dia de hoje em Brasília (AAAA-MM-DD). */
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Oportunidade aberta → etapa "ganho" da org, pelas mesmas regras de fechamento da tela. */
async function marcarComoGanha(db: Db, org: string, oppId: string, pagoEm: string | null): Promise<boolean> {
  const { data: opp } = await db.from("opportunities").select("status, deleted_at")
    .eq("id", oppId).eq("organization_id", org).maybeSingle();
  if (!opp || opp.deleted_at || opp.status !== "open") return false;
  const { data: etapa } = await db.from("pipeline_stages").select("id")
    .eq("organization_id", org).eq("type", "won").order("order_index", { ascending: true }).limit(1).maybeSingle();
  if (!etapa) return false;
  const { data, error } = await db.rpc("transition_opportunity_stage_v1", {
    _organization_id: org, _opportunity_id: oppId, _target_stage_id: etapa.id, _close_date: pagoEm ?? hoje(),
    _override: false, _override_reason: "", _source: "plamev_pagamento",
  });
  if (error || data?.ok !== true) {
    console.warn(`[plamev-quote] marcar ganha não aplicada opp=${oppId} motivo=${error?.code ?? data?.error ?? "?"}`);
    return false;
  }
  return true;
}

/** Consulta a Plamev e grava o status. Adesão paga: nota na linha do tempo (uma vez) e, se ligado, oportunidade ganha. */
async function verificarPagamento(db: Db, token: string, c: CotacaoLinha, marcarGanha: boolean) {
  const agora = new Date().toISOString();
  const raw = await plamev(token, `Cotacoes/VerificarConversaoVenda/${encodeURIComponent(c.plamev_cotacao_id)}`, { naoEncontrado: true });
  if (!raw) {
    await db.from("plamev_quotes").update({ status_verificado_em: agora }).eq("id", c.id);
    return;
  }
  const v = L.conversao(raw);
  await db.from("plamev_quotes").update({
    virou_venda: v.virouVenda, adesao_paga: v.adesaoPaga, adesao_situacao: v.adesaoSituacao, venda_situacao: v.vendaSituacao,
    adesao_pago_em: v.pagoEm, status_verificado_em: agora,
  }).eq("id", c.id);
  if (!v.adesaoPaga) return;

  // Trava: o cron e o widget podem ver o pagamento ao mesmo tempo; só quem marcar primeiro registra.
  const { data: trava } = await db.from("plamev_quotes").update({ pagamento_registrado_em: agora })
    .eq("id", c.id).is("pagamento_registrado_em", null).select("id").maybeSingle();
  if (!trava) return;

  const ganha = marcarGanha ? await marcarComoGanha(db, c.organization_id, c.opportunity_id, v.pagoEm) : false;
  const { data: opp } = await db.from("opportunities").select("contact_id").eq("id", c.opportunity_id).maybeSingle();
  const nota = L.notaPagamento(c.numero_cotacao, v, ganha);
  const { error } = await db.from("activities").insert({
    organization_id: c.organization_id, opportunity_id: c.opportunity_id, contact_id: opp?.contact_id ?? null,
    activity_type: "note", title: nota.title, body: nota.body, created_by_user_id: null,
  });
  if (error) console.error(`[plamev-quote] nota de pagamento falhou opp=${c.opportunity_id} code=${error.code}`);
  console.log(`[plamev-quote] adesão paga org=${c.organization_id} opp=${c.opportunity_id} ganha=${ganha}`);
}

const DIA = 24 * 60 * 60 * 1000;

const MODELO_IA = "claude-opus-5-5";

// Arquivo do material em base64, por instância. O caminho nunca muda (arquivo novo = caminho novo), então não expira.
const arquivos = new Map<string, string>();
async function base64DoMaterial(db: Db, storagePath: string): Promise<string> {
  const pronto = arquivos.get(storagePath);
  if (pronto) return pronto;
  const { data, error } = await db.storage.from("plamev-materiais").download(storagePath);
  if (error || !data) throw new Error(`material_download: ${error?.message ?? "vazio"}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  arquivos.set(storagePath, b64);
  return b64;
}

/**
 * Chave do Claude da org: BYOK verificada primeiro, depois a integração antiga (mesma regra do ai-generate).
 * Só Claude: é ele que lê os PDFs e as imagens direto.
 */
async function chaveClaude(db: Db, org: string) {
  const { data: integracoes } = await db.from("organization_integrations")
    .select("config_values, integration:admin_integrations!inner(slug)")
    .eq("organization_id", org).eq("is_enabled", true).in("integration.slug", ["claude-ai", "openai-gpt"]);
  const legado: LegacyAiRow[] = (integracoes ?? []).map((i: { config_values: Record<string, unknown> | null; integration: { slug: string } }) => ({
    slug: i.integration.slug, config_values: i.config_values,
  }));
  const cred = pickTextAiCredential(await readSecretPayload(db, org), legado);
  if (!cred || cred.slug !== "claude-ai") throw new L.Recusa(409, "ia_sem_chave_claude");
  if (cred.kind === "byok") {
    const limite = Number(cred.entry.monthly_budget_usd ?? 0);
    if (limite > 0 && await byokBudgetExceeded(db, org, "anthropic", limite)) throw new L.Recusa(402, "ia_limite_mensal");
    return { apiKey: await decryptSecret(cred.entry.api_key_encrypted!), byok: true };
  }
  return { apiKey: String(cred.config.api_key), byok: false };
}

/** pg_cron: cotações não pagas dos últimos 60 dias, as menos recentemente conferidas primeiro, até ~90 s. */
async function cronPagamentos(db: Db) {
  const inicio = Date.now();
  const { data: fila, error } = await db.from("plamev_quotes").select(COLUNAS_COTACAO)
    .eq("adesao_paga", false)
    .gte("created_at", new Date(Date.now() - 60 * DIA).toISOString())
    .or(`status_verificado_em.is.null,status_verificado_em.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()}`)
    .order("status_verificado_em", { ascending: true, nullsFirst: true })
    .limit(100);
  if (error) throw new Error(`fila: ${error.code}`);

  const porOrg = new Map<string, CotacaoLinha[]>();
  for (const c of (fila ?? []) as CotacaoLinha[]) porOrg.set(c.organization_id, [...(porOrg.get(c.organization_id) ?? []), c]);

  let conferidas = 0, falhas = 0;
  for (const [org, cotacoes] of porOrg) {
    const { data: widget } = await db.from("organization_widgets").select("is_enabled")
      .eq("organization_id", org).eq("widget_key", L.MODULE_KEY).maybeSingle();
    const { data: cred } = await db.from("plamev_credentials").select("token_ciphertext, marcar_ganha_ao_pagar")
      .eq("organization_id", org).maybeSingle();
    if (widget?.is_enabled !== true || !cred) continue;
    const token = await decryptIntegrationSecret(cred.token_ciphertext);
    for (const c of cotacoes) {
      if (Date.now() - inicio > 90_000) break;
      try {
        await verificarPagamento(db, token, c, cred.marcar_ganha_ao_pagar === true);
        conferidas++;
      } catch (e) {
        falhas++;
        console.warn(`[plamev-quote] cron pagamento falhou org=${org} ${(e as L.Recusa).codigo ?? (e as Error).name}`);
        // Token recusado: as outras cotações da org vão falhar igual.
        if (e instanceof L.Recusa && e.codigo === "plamev_unauthorized") break;
      }
    }
  }
  console.log(`[plamev-quote] cron pagamentos conferidas=${conferidas} falhas=${falhas} fila=${fila?.length ?? 0}`);
  return { conferidas, falhas };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (body?.action === L.CRON_ACTION) {
    if (!validateServiceRoleAuth(req).ok) return json(401, { error: "unauthorized" });
    try {
      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      return json(200, await cronPagamentos(db));
    } catch (e) {
      console.error(`[plamev-quote] cron pagamentos falhou: ${(e as Error).message}`);
      return json(500, { error: "cron_failed" });
    }
  }

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

  const trace: Chamada[] = [];
  try {
    if (L.CONFIG_ACTIONS.includes(action)) {
      const { data: perfil } = membership.permission_profile_id
        ? await db.from("permission_profiles").select("permissions").eq("id", membership.permission_profile_id).maybeSingle()
        : { data: null };
      if ((perfil?.permissions as Record<string, unknown> | null)?.can_manage_settings !== true) {
        return json(403, { error: "can_manage_settings_required" });
      }

      if (action === "config_get") {
        const { data } = await db.from("plamev_credentials").select("token_last4, updated_at, marcar_ganha_ao_pagar")
          .eq("organization_id", org).maybeSingle();
        return json(200, {
          configurado: !!data, final: data?.token_last4 ?? null, atualizadoEm: data?.updated_at ?? null,
          marcarGanhaAoPagar: data?.marcar_ganha_ao_pagar === true,
        });
      }
      if (action === "config_opcoes") {
        if (typeof body.marcar_ganha_ao_pagar !== "boolean") return json(400, { error: "invalid_marcar_ganha_ao_pagar" });
        const { data, error } = await db.from("plamev_credentials").update({ marcar_ganha_ao_pagar: body.marcar_ganha_ao_pagar })
          .eq("organization_id", org).select("organization_id").maybeSingle();
        if (error) throw new Error(`config_opcoes: ${error.code}`);
        if (!data) return json(409, { error: "plamev_not_configured" });
        console.log(`[plamev-quote] opção marcar_ganha_ao_pagar=${body.marcar_ganha_ao_pagar} org=${org} user=${me.id}`);
        return json(200, { marcarGanhaAoPagar: body.marcar_ganha_ao_pagar });
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

    // Cotações da oportunidade; sem oportunidade (conversa/contato), das oportunidades do contato que o usuário enxerga.
    const cotacoesVisiveis = async (opp: { id: string } | null, contatoId: string | null): Promise<CotacaoLinha[]> => {
      let ids: string[] = opp ? [opp.id] : [];
      if (!opp && contatoId) {
        const { data } = await userClient.from("opportunities").select("id")
          .eq("organization_id", org).eq("contact_id", contatoId).is("deleted_at", null).limit(50);
        ids = (data ?? []).map((o: { id: string }) => o.id);
      }
      if (!ids.length) return [];
      const { data } = await db.from("plamev_quotes").select(COLUNAS_COTACAO)
        .eq("organization_id", org).in("opportunity_id", ids).order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as unknown as CotacaoLinha[];
    };
    const contatoDoPedido = (opp: { contact_id: string | null } | null) =>
      opp?.contact_id ?? (body.contact_id != null ? L.guid(body.contact_id, "contact_id") : null);

    if (action === "contexto") {
      const opp = await oportunidade(body.opportunity_id);
      const contatoId = contatoDoPedido(opp);
      const { data: contato } = contatoId
        ? await userClient.from("contacts")
          .select("full_name, first_name, last_name, email, phone, cpf, address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, organization_id, deleted_at")
          .eq("id", contatoId).maybeSingle()
        : { data: null };
      const contatoOk = contato && !contato.deleted_at && contato.organization_id === org;
      return json(200, {
        cliente: contatoOk ? L.clienteDoContato(contato) : null,
        cotacoes: (await cotacoesVisiveis(opp, contatoOk ? contatoId : null)).map(cotacaoParaWidget),
      });
    }

    if (action === "materiais") {
      const { data, error } = await db.from("plamev_materials")
        .select("id, titulo, descricao, tipo, mime_type, storage_path, tamanho_bytes")
        .eq("ativo", true).is("removido_em", null).order("ordem", { ascending: true }).order("created_at", { ascending: true }).limit(100);
      if (error) throw new Error(`materiais: ${error.code}`);
      return json(200, {
        materiais: (data ?? []).map((m) => ({
          id: m.id, titulo: m.titulo, descricao: m.descricao, tipo: m.tipo, mimeType: m.mime_type,
          tamanho: Number(m.tamanho_bytes), url: L.urlMaterial(url, m.storage_path),
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

      case "rede": {
        const cep = L.cep(body.cep);
        const raio = L.raioKm(body.raio_km);
        const raw = await plamev(token, "Credenciados/BuscarRedeCredenciadaPorLocalidade",
          { body: { Cep: cep, Raio: String(raio) }, cacheOrg: org, naoEncontrado: true });
        return json(200, { credenciados: raw ? L.rede(raw).slice(0, 50) : [] });
      }

      case "pagamento": {
        const opp = await oportunidade(body.opportunity_id);
        const cotacoes = await cotacoesVisiveis(opp, contatoDoPedido(opp));
        const { data: opcoes } = await db.from("plamev_credentials").select("marcar_ganha_ao_pagar").eq("organization_id", org).maybeSingle();
        // Pagas não mudam mais; as outras, até 10 por vez (cada uma é uma chamada à Plamev).
        for (const c of cotacoes.filter((c) => !c.adesao_paga).slice(0, 10)) {
          try {
            await verificarPagamento(db, token, c, opcoes?.marcar_ganha_ao_pagar === true);
          } catch (e) {
            // Token recusado vale para todas: mostra ao vendedor. Outra falha fica só nessa cotação.
            if (e instanceof L.Recusa && e.codigo === "plamev_unauthorized") throw e;
            console.warn(`[plamev-quote] pagamento falhou opp=${c.opportunity_id} ${(e as L.Recusa).codigo ?? (e as Error).name}`);
          }
        }
        return json(200, { cotacoes: (await cotacoesVisiveis(opp, contatoDoPedido(opp))).map(cotacaoParaWidget) });
      }

      case "perguntar": {
        const { pergunta, usarConversa } = P.pedidoPergunta(body);
        // Conversa lida com o JWT do usuário: só a que ele enxerga.
        let conversa: string | null = null;
        if (usarConversa) {
          const threadId = L.guid(body.thread_id, "thread_id");
          const { data: thread } = await userClient.from("message_threads").select("id, organization_id").eq("id", threadId).maybeSingle();
          if (!thread || thread.organization_id !== org) return json(404, { error: "thread_not_found" });
          const { data: msgs } = await userClient.from("messages").select("direction, content, media_type")
            .eq("thread_id", threadId).is("deleted_at", null).order("created_at", { ascending: false }).limit(P.MAX_MENSAGENS_CONVERSA);
          conversa = P.textoConversa(((msgs ?? []) as P.MensagemConversa[]).reverse()) || null;
          if (!conversa && !pergunta) return json(422, { error: "conversa_vazia" });
        }

        const { data: lista, error: eMat } = await db.from("plamev_materials")
          .select("id, titulo, descricao, tipo, mime_type, storage_path, tamanho_bytes")
          .eq("ativo", true).is("removido_em", null).order("ordem", { ascending: true }).order("created_at", { ascending: true });
        if (eMat) throw new Error(`materiais: ${eMat.code}`);
        const todos = (lista ?? []).map((m) => ({
          id: m.id as string, titulo: m.titulo as string, descricao: m.descricao as string, tipo: m.tipo as "image" | "document",
          mimeType: m.mime_type as string, bytes: Number(m.tamanho_bytes), storagePath: m.storage_path as string,
        }));
        if (!todos.length) return json(409, { error: "ia_sem_materiais" });
        const { dentro, fora } = P.materiaisQueCabem(todos);

        const chave = await chaveClaude(db, org);
        // Materiais primeiro e sempre na mesma ordem: com o sistema, formam o prefixo em cache entre perguntas.
        const blocos: Anthropic.Beta.BetaContentBlockParam[] = [];
        for (const m of dentro) {
          const data = await base64DoMaterial(db, m.storagePath);
          blocos.push({ type: "text", text: P.rotuloMaterial(m) });
          blocos.push(m.tipo === "document"
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: m.titulo }
            : { type: "image", source: { type: "base64", media_type: m.mimeType as "image/png" | "image/jpeg" | "image/webp", data } });
        }
        (blocos[blocos.length - 1] as { cache_control?: { type: "ephemeral" } }).cache_control = { type: "ephemeral" };
        blocos.push({ type: "text", text: P.textoPedido(pergunta, conversa) });

        const cliente = new Anthropic({ apiKey: chave.apiKey, timeout: 100_000, maxRetries: 1 });
        let resposta: Anthropic.Beta.BetaMessage;
        try {
          resposta = await cliente.beta.messages.create({
            model: MODELO_IA,
            max_tokens: 4000,
            // Atendimento ao vivo: resposta rápida vale mais que raciocínio longo.
            output_config: { effort: "low", format: P.FORMATO_RESPOSTA },
            // Se o modelo recusar por política, a própria API tenta o modelo indicado para a categoria.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: P.SISTEMA,
            messages: [{ role: "user", content: blocos }],
          });
        } catch (e) {
          if (e instanceof Anthropic.AuthenticationError) {
            if (chave.byok) await markByokInvalid(db, org, "anthropic", "invalid_key");
            throw new L.Recusa(409, "ia_chave_recusada");
          }
          if (e instanceof Anthropic.RateLimitError) throw new L.Recusa(429, "ia_ocupada");
          if (e instanceof Anthropic.APIError) {
            console.warn(`[plamev-quote] perguntar claude ${e.status}`);
            throw new L.Recusa(502, "ia_indisponivel");
          }
          throw e;
        }

        const entrada = P.tokensEntradaEquivalentes(resposta.usage);
        const saida = resposta.usage.output_tokens ?? 0;
        // BYOK entra com custo e origem (é o que o limite mensal soma); chave antiga registra como no ai-generate.
        if (chave.byok) {
          await logAiUsage(db, {
            organization_id: org, user_id: me.id, provider: "anthropic", model: resposta.model,
            source: "customer_key", action: "plamev_perguntar", integration_slug: "claude-ai",
            prompt_tokens: entrada, completion_tokens: saida, total_tokens: entrada + saida,
            estimated_cost_usd: await estimateTextCostUsd(db, "anthropic", resposta.model, entrada, saida),
          });
        } else {
          await db.from("ai_usage_logs").insert({
            organization_id: org, user_id: me.id, integration_slug: "claude-ai", model_used: resposta.model,
            action: "plamev_perguntar", prompt_tokens: entrada, completion_tokens: saida, total_tokens: entrada + saida,
          });
        }
        console.log(`[plamev-quote] perguntar org=${org} materiais=${dentro.length} cache_lido=${resposta.usage.cache_read_input_tokens ?? 0} stop=${resposta.stop_reason}`);

        if (resposta.stop_reason === "refusal") return json(422, { error: "ia_recusou" });
        const texto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        const r = P.respostaIa(texto, new Set(dentro.map((m) => m.id)));
        return json(200, { ...r, materiaisFora: fora.map((m) => m.titulo) });
      }

      case "simular": {
        const pedido = L.pedidoSimulacao(body);
        const raw = await plamev(token, "Cotacoes/SimulaCotacaoPet", { body: L.corpoSimulacao(pedido, CONSULTOR), trace });
        return json(200, { resultado: L.resultado(raw), payload: trace });
      }

      case "solicitar": {
        const pedido = L.pedidoSimulacao(body);
        const cliente = L.cliente(body);
        // Confere a oportunidade ANTES de gravar na Plamev: sem acesso, não cria cotação lá.
        const opp = await oportunidade(body.opportunity_id);
        const raw = await plamev(token, "Cotacoes/SolicitaCotacaoPet", { body: L.corpoCotacao(pedido, cliente, CONSULTOR), trace });
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
        return json(200, { resultado: r, salvaNaOportunidade, payload: trace });
      }
    }
  } catch (e) {
    const payload = trace.length ? trace : undefined;
    if (e instanceof L.Recusa) return json(e.status, { error: e.codigo, message: e.message, payload });
    console.error(`[plamev-quote] ${action} falhou: ${(e as Error).name}`);
    return json(502, { error: "plamev_unavailable", payload });
  }
  return json(400, { error: "invalid_action" });
});
