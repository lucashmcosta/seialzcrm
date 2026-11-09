// Acesso ao Claude dos materiais Plamev, usado pelo "Perguntar" do widget e pelo admin (plamev-materiais-ia).
import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";
import { decryptSecret } from "../_shared/crypto.ts";
import { byokBudgetExceeded, readSecretPayload } from "../_shared/intelligence/resolve-provider.ts";
import { pickTextAiCredential, type LegacyAiRow } from "../_shared/intelligence/text-ai-credential.ts";
import { Recusa } from "./logic.ts";
import * as P from "./perguntar.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

// Arquivo do material em base64, por instância. O caminho nunca muda (arquivo novo = caminho novo), então não expira.
const arquivos = new Map<string, string>();
export async function base64DoMaterial(db: Db, storagePath: string): Promise<string> {
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
export async function chaveClaude(db: Db, org: string) {
  const { data: integracoes } = await db.from("organization_integrations")
    .select("config_values, integration:admin_integrations!inner(slug)")
    .eq("organization_id", org).eq("is_enabled", true).in("integration.slug", ["claude-ai", "openai-gpt"]);
  const legado: LegacyAiRow[] = (integracoes ?? []).map((i: { config_values: Record<string, unknown> | null; integration: { slug: string } }) => ({
    slug: i.integration.slug, config_values: i.config_values,
  }));
  const cred = pickTextAiCredential(await readSecretPayload(db, org), legado);
  if (!cred || cred.slug !== "claude-ai") throw new Recusa(409, "ia_sem_chave_claude");
  if (cred.kind === "byok") {
    const limite = Number(cred.entry.monthly_budget_usd ?? 0);
    if (limite > 0 && await byokBudgetExceeded(db, org, "anthropic", limite)) throw new Recusa(402, "ia_limite_mensal");
    return { apiKey: await decryptSecret(cred.entry.api_key_encrypted!), byok: true };
  }
  return { apiKey: String(cred.config.api_key), byok: false };
}

/** Materiais primeiro e sempre na mesma ordem: com o sistema, formam o prefixo em cache entre perguntas. */
export async function blocosMateriais(db: Db, materiais: Array<P.MaterialIa & { storagePath: string }>) {
  const blocos: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const m of materiais) {
    if (m.conteudoMd) {
      blocos.push({ type: "text", text: `${P.rotuloMaterial(m)}\n\n${m.conteudoMd}` });
      continue;
    }
    const data = await base64DoMaterial(db, m.storagePath);
    blocos.push({ type: "text", text: P.rotuloMaterial(m) });
    blocos.push(m.tipo === "document"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: m.titulo }
      : { type: "image", source: { type: "base64", media_type: m.mimeType as "image/png" | "image/jpeg" | "image/webp", data } });
  }
  (blocos[blocos.length - 1] as { cache_control?: { type: "ephemeral" } }).cache_control = { type: "ephemeral" };
  return blocos;
}

export function perguntarClaude(cliente: Anthropic, modelo: string, blocos: Anthropic.Beta.BetaContentBlockParam[]) {
  return cliente.beta.messages.create({
    model: modelo,
    max_tokens: 4000,
    // Atendimento ao vivo: resposta rápida vale mais que raciocínio longo.
    output_config: { effort: "low", format: P.FORMATO_RESPOSTA },
    // Se o modelo recusar por política, a própria API tenta o modelo indicado para a categoria.
    ...(P.temFallback(modelo) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    system: P.SISTEMA,
    messages: [{ role: "user", content: blocos }],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming) as Promise<Anthropic.Beta.BetaMessage>;
}
