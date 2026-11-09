// Admin dos materiais Plamev (equipe Seialz, com MFA). Os materiais valem para todas as orgs, então a IA usa a chave
// da org mais antiga com credencial Plamev e chave Claude, e o gasto entra no limite dela.
//   { action: 'gerar_md', material_id } → converte em segundo plano; a tela acompanha por md_status
//   { action: 'testar', pergunta }      → mesma pergunta nos modelos, para comparar resposta e custo
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";
import { corsHeaders } from "../_shared/cors.ts";
import { logAiUsage } from "../_shared/intelligence/log-usage.ts";
import { estimateTextCostUsd } from "../_shared/intelligence/pricing.ts";
import { base64DoMaterial, blocosMateriais, chaveClaude, perguntarClaude } from "../plamev-quote/ia.ts";
import { Recusa } from "../plamev-quote/logic.ts";
import * as P from "../plamev-quote/perguntar.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function orgDaChave(db: any) {
  const { data } = await db.from("plamev_credentials").select("organization_id").order("created_at", { ascending: true });
  let ultimo: unknown = null;
  for (const { organization_id: org } of data ?? []) {
    try {
      return { org, chave: await chaveClaude(db, org) };
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo ?? new Recusa(409, "ia_sem_chave_claude");
}

// deno-lint-ignore no-explicit-any
async function registrarUso(db: any, p: { org: string; byok: boolean; modelo: string; acao: string; entrada: number; saida: number }) {
  const custo = await estimateTextCostUsd(db, "anthropic", p.modelo, p.entrada, p.saida);
  if (p.byok) {
    await logAiUsage(db, {
      organization_id: p.org, provider: "anthropic", model: p.modelo, source: "customer_key", action: p.acao,
      integration_slug: "claude-ai", prompt_tokens: p.entrada, completion_tokens: p.saida,
      total_tokens: p.entrada + p.saida, estimated_cost_usd: custo,
    });
  }
  return custo;
}

// deno-lint-ignore no-explicit-any
async function converter(db: any, material: any, org: string, chave: { apiKey: string; byok: boolean }) {
  try {
    const data = await base64DoMaterial(db, material.storage_path);
    const cliente = new Anthropic({ apiKey: chave.apiKey, timeout: 300_000, maxRetries: 1 });
    const arquivo = material.tipo === "document"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: material.mime_type, data } };
    const resposta = await cliente.messages.stream({
      model: P.MODELO_PADRAO,
      max_tokens: 32000,
      output_config: { effort: "low" },
      system: P.SISTEMA_MD,
      messages: [{ role: "user", content: [arquivo, { type: "text", text: `Transcreva este material: ${material.titulo}` }] }],
    // deno-lint-ignore no-explicit-any
    } as any).finalMessage();
    // Corte no meio deixaria tabela pela metade parecendo completa.
    if (resposta.stop_reason !== "end_turn") throw new Error(`conversao_incompleta:${resposta.stop_reason}`);
    const texto = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!texto) throw new Error("conversao_vazia");
    const { error } = await db.from("plamev_materials").update({
      conteudo_md: texto, md_status: "gerado", md_erro: null, md_gerado_em: new Date().toISOString(),
      md_revisado_em: null, md_revisado_por_auth_user_id: null,
    }).eq("id", material.id);
    if (error) throw new Error(`salvar: ${error.code}`);
    await registrarUso(db, {
      org, byok: chave.byok, modelo: resposta.model, acao: "plamev_material_md",
      entrada: resposta.usage.input_tokens ?? 0, saida: resposta.usage.output_tokens ?? 0,
    });
  } catch (e) {
    console.error("[plamev-materiais-ia] conversao", material.id, (e as Error).message);
    await db.from("plamev_materials").update({ md_status: "erro", md_erro: (e as Error).message.slice(0, 300) }).eq("id", material.id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "Unauthorized" });
    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return json(401, { error: "Unauthorized" });
    const { data: admin } = await db.from("admin_users").select("is_active, mfa_enabled").eq("auth_user_id", user.id).maybeSingle();
    if (!admin?.is_active || !admin?.mfa_enabled) return json(403, { error: "forbidden" });

    const body = await req.json().catch(() => ({}));
    const { org, chave } = await orgDaChave(db);

    if (body.action === "gerar_md") {
      const { data: material } = await db.from("plamev_materials")
        .select("id, titulo, tipo, mime_type, storage_path, md_status").eq("id", String(body.material_id ?? "")).maybeSingle();
      if (!material) return json(404, { error: "material_nao_encontrado" });
      const { error } = await db.from("plamev_materials").update({ md_status: "gerando", md_erro: null }).eq("id", material.id);
      if (error) throw new Error(`status: ${error.code}`);
      EdgeRuntime.waitUntil(converter(db, material, org, chave));
      return json(202, { ok: true });
    }

    if (body.action === "testar") {
      const { pergunta } = P.pedidoPergunta({ pergunta: body.pergunta });
      if (!pergunta) throw new Recusa(400, "missing_pergunta");
      const { data: lista, error } = await db.from("plamev_materials")
        .select("id, titulo, descricao, tipo, mime_type, storage_path, tamanho_bytes, conteudo_md, md_status")
        .eq("ativo", true).is("removido_em", null).order("ordem", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw new Error(`materiais: ${error.code}`);
      const { dentro } = P.materiaisQueCabem((lista ?? []).map(P.materialParaIa));
      if (!dentro.length) return json(409, { error: "ia_sem_materiais" });
      const blocos = await blocosMateriais(db, dentro);
      blocos.push({ type: "text", text: P.textoPedido(pergunta, null) });
      const cliente = new Anthropic({ apiKey: chave.apiKey, timeout: 100_000, maxRetries: 1 });
      const resultados = await Promise.all(P.MODELOS_TESTE.map(async (modelo) => {
        const inicio = Date.now();
        try {
          const r = await perguntarClaude(cliente, modelo, blocos);
          const entrada = P.tokensEntradaEquivalentes(r.usage);
          const saida = r.usage.output_tokens ?? 0;
          const custo = await registrarUso(db, { org, byok: chave.byok, modelo, acao: "plamev_teste_modelo", entrada, saida });
          const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
          const { resposta, encontrado } = P.respostaIa(texto, new Set(dentro.map((m) => m.id)));
          return { modelo, resposta, encontrado, custo, segundos: Math.round((Date.now() - inicio) / 100) / 10 };
        } catch (e) {
          console.error("[plamev-materiais-ia] testar", modelo, (e as Error).message);
          return { modelo, erro: e instanceof Anthropic.APIError ? `Erro ${e.status} da IA` : "Não foi possível responder." };
        }
      }));
      return json(200, {
        resultados,
        usandoTexto: dentro.filter((m) => m.conteudoMd).length,
        usandoArquivo: dentro.filter((m) => !m.conteudoMd).length,
      });
    }

    return json(400, { error: "invalid_action" });
  } catch (e) {
    if (e instanceof Recusa) return json(e.status, { error: e.codigo });
    console.error("[plamev-materiais-ia]", (e as Error).message);
    return json(500, { error: "internal_error" });
  }
});
