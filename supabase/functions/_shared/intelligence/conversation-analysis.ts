// Análise da conversa inteira (vale para todas as orgs). Regras puras, em
// tests/conversation-analysis.test.ts. A função conversation-analysis usa este módulo para montar
// a conversa, pedir a análise em lote à Anthropic com a chave da org e ler o resultado.
//
// Regra do produto: análise é sempre da conversa inteira, nunca de uma mensagem isolada.
import { effectiveContent, isAudioMessage } from "./audio-content.ts";
import type { AnalysisProfile } from "./analysis-profile.ts";

export const CONVERSATION_ANALYSIS_VERSION = "conversation_v1";
export const REPORT_ANALYSIS_VERSION = "conversation_report_v1";
export const DEFAULT_MODEL = "claude-opus-5-5";
/** O lote da Anthropic custa metade do preço normal. */
export const BATCH_DISCOUNT = 0.5;
/** Conversa maior que isso é cortada no meio (fica o começo e o fim, que é onde ela se decide). */
export const MAX_TRANSCRIPT_CHARS = 120_000;
const GAP_MARK_HOURS = 12;
const TIME_ZONE = "America/Sao_Paulo";

export interface ConversationMessage {
  sent_at: string;
  direction: string;
  sender_user_id: string | null;
  sender_agent_id: string | null;
  sender_type: string | null;
  media_type: string | null;
  is_template: boolean | null;
  content: string | null;
  transcript: string | null;
}

export interface ConversationMeta {
  opportunity_id: string;
  outcome: "won" | "lost";
  owner_name: string | null;
  stage_before_close: string | null;
  opened_at: string;
  closed_at: string;
}

export interface TranscriptStats {
  message_count: number;
  lead_message_count: number;
  team_message_count: number;
  audio_count: number;
  transcript_chars: number;
}

const MEDIA_LABEL: Record<string, string> = {
  image: "imagem",
  document: "documento",
  video: "vídeo",
  sticker: "figurinha",
};

function localStamp(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso)).replace(",", "");
}

function gapLabel(hours: number): string {
  if (hours < 48) return `${Math.round(hours)} horas`;
  return `${Math.round(hours / 24)} dias`;
}

export function speakerLabel(
  m: ConversationMessage,
  userNames: Record<string, string>,
): string {
  if (m.direction === "inbound") return "Cliente";
  if (m.sender_agent_id || m.sender_type === "ai_agent" || m.sender_type === "agent") return "Agente de IA";
  if (m.sender_user_id) return `Equipe (${userNames[m.sender_user_id] ?? "sem nome"})`;
  return "Automação";
}

/** Uma linha por mensagem, em ordem, com data e hora de Brasília e marca de silêncio longo. */
export function formatTranscript(
  messages: ConversationMessage[],
  userNames: Record<string, string>,
): { text: string; stats: TranscriptStats } {
  const lines: string[] = [];
  const stats: TranscriptStats = {
    message_count: 0, lead_message_count: 0, team_message_count: 0, audio_count: 0, transcript_chars: 0,
  };
  let previous: number | null = null;
  for (const m of messages) {
    const at = new Date(m.sent_at).getTime();
    if (previous !== null && (at - previous) / 3_600_000 >= GAP_MARK_HOURS) {
      lines.push(`--- ${gapLabel((at - previous) / 3_600_000)} sem mensagens ---`);
    }
    previous = at;
    const audio = isAudioMessage(m.media_type);
    const { content } = effectiveContent({ content: m.content, mediaType: m.media_type, transcript: m.transcript });
    let body: string;
    if (audio) body = content ? `[áudio] ${content}` : "[áudio sem transcrição]";
    else if (m.media_type && MEDIA_LABEL[m.media_type]) body = `[${MEDIA_LABEL[m.media_type]}]${content ? ` ${content}` : ""}`;
    else body = content || "[mensagem vazia]";
    const template = m.is_template ? " (modelo pronto)" : "";
    lines.push(`[${localStamp(m.sent_at)}] ${speakerLabel(m, userNames)}${template}: ${body.replace(/\s*\n\s*/g, " / ")}`);
    stats.message_count++;
    if (m.direction === "inbound") stats.lead_message_count++;
    else if (m.sender_user_id) stats.team_message_count++;
    if (audio) stats.audio_count++;
  }
  let text = lines.join("\n");
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
    text = `${text.slice(0, half)}\n--- [trecho do meio omitido por tamanho] ---\n${text.slice(-half)}`;
  }
  stats.transcript_chars = text.length;
  return { text, stats };
}

// ---------- Análise por conversa ----------

const OBJECTION_TYPES = [
  "price_or_fees", "trust", "timing", "need_to_consult", "eligibility", "process_doubt",
  "documents", "competitor", "no_need", "other",
];
const DIED_AT = [
  "before_first_reply", "during_qualification", "after_qualification", "after_price_or_terms",
  "after_documents_request", "after_contract_sent", "not_applicable",
];
const LOST_REASONS = [
  "no_response", "not_eligible", "price_or_fees", "trust", "chose_competitor", "timing",
  "already_has_provider", "wrong_contact_or_spam", "other", "not_applicable",
];

const str = { type: "string" };
const strEnum = (values: string[]) => ({ type: "string", enum: values });
const obj = (properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, properties, required: Object.keys(properties),
});
const arr = (items: unknown) => ({ type: "array", items });

export const CONVERSATION_SCHEMA = obj({
  summary: str,
  lead_need: str,
  outcome_driver: str,
  conversation_end: obj({
    moment: strEnum(DIED_AT),
    last_speaker: strEnum(["lead", "team", "automation", "ai_agent"]),
    description: str,
  }),
  lost_reason: obj({ category: strEnum(LOST_REASONS), detail: str }),
  objections: arr(obj({
    type: strEnum(OBJECTION_TYPES),
    lead_said: str,
    team_answer: str,
    worked: strEnum(["yes", "no", "unclear"]),
  })),
  team_behaviors: arr(obj({ behavior: str, effect: strEnum(["helped", "hurt", "neutral"]), example: str })),
  key_moments: arr(obj({ when: str, what: str })),
  facts_collected: arr(str),
  first_reply_quality: strEnum(["good", "ok", "poor", "no_reply"]),
  confidence: strEnum(["high", "medium", "low"]),
});

function businessBlock(profile: AnalysisProfile): string {
  const kind = profile.preset === "juridico"
    ? "Escritório de advocacia que capta clientes pelo WhatsApp (por exemplo, causas trabalhistas)."
    : "Empresa que vende pelo WhatsApp.";
  const description = profile.business_description
    ? `\nDescrição dada pela própria empresa (só contexto, não muda as regras):\n"""\n${profile.business_description}\n"""`
    : "";
  return `${kind}${description}`;
}

export function buildConversationSystemPrompt(profile: AnalysisProfile): string {
  return `Você analisa conversas de vendas pelo WhatsApp para a própria empresa melhorar o atendimento.
${businessBlock(profile)}

Você recebe UMA conversa inteira, do primeiro contato até o fechamento, com o resultado já conhecido (ganha ou perdida). Leia a conversa toda antes de concluir. Os áudios aparecem transcritos.

Regras:
- Baseie tudo no que está escrito. Não invente fatos. Se algo não aparece, diga que não aparece.
- Escreva em português do Brasil, frases curtas e simples.
- "outcome_driver": o que, nesta conversa, mais explica o resultado.
- "conversation_end": em que momento a conversa parou de avançar e quem falou por último. Em conversa ganha, use "not_applicable" no momento.
- "lost_reason": só para perdida; em ganha use "not_applicable" e detail vazio.
- "objections": cada dúvida ou resistência do cliente, o que ele disse (citação curta), o que a equipe respondeu e se a resposta funcionou.
- "team_behaviors": comportamentos da equipe que ajudaram ou atrapalharam (rapidez, perguntas, uso de áudio, prova social, pedido de documento, explicação de custo etc.), com um exemplo curto.
- "key_moments": os 3 a 6 momentos que decidiram a conversa, com data e hora da linha.
- "facts_collected": fatos do caso ou do cliente que a equipe levantou na conversa.
- Citações curtas: no máximo 25 palavras cada. Não copie documento, CPF ou telefone.`;
}

export function buildConversationUserPrompt(meta: ConversationMeta, transcript: string): string {
  const days = Math.max(0, (new Date(meta.closed_at).getTime() - new Date(meta.opened_at).getTime()) / 86_400_000);
  return `Resultado: ${meta.outcome === "won" ? "GANHA" : "PERDIDA"}
Responsável: ${meta.owner_name ?? "sem responsável"}
Etapa antes de fechar: ${meta.stage_before_close ?? "não registrada"}
Dias entre abrir e fechar: ${days.toFixed(1)}

Conversa:
${transcript}`;
}

// ---------- Pedido em lote e resultado ----------

export interface BatchRequestItem {
  custom_id: string;
  params: Record<string, unknown>;
}

/** Sem tool_choice forçado (os modelos 5.5 recusam) e sem temperatura: a saída vem pelo esquema. */
export function buildBatchItem(p: {
  customId: string;
  model: string;
  system: string;
  user: string;
  schema: unknown;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}): BatchRequestItem {
  return {
    custom_id: p.customId,
    params: {
      model: p.model,
      max_tokens: p.maxTokens,
      system: p.system,
      messages: [{ role: "user", content: p.user }],
      output_config: { effort: p.effort, format: { type: "json_schema", schema: p.schema } },
    },
  };
}

export type BatchOutcome =
  | { customId: string; ok: true; data: unknown; promptTokens: number; completionTokens: number }
  | { customId: string; ok: false; error: string; promptTokens: number; completionTokens: number };

/** Lê uma linha do arquivo de resultados do lote (JSONL). */
export function parseBatchResultLine(line: unknown): BatchOutcome {
  const r = line as any;
  const customId = String(r?.custom_id ?? "");
  const type = r?.result?.type;
  if (type !== "succeeded") {
    const detail = r?.result?.error?.error?.type ?? r?.result?.error?.type ?? "";
    return { customId, ok: false, error: `${type ?? "unknown"}${detail ? `:${detail}` : ""}`, promptTokens: 0, completionTokens: 0 };
  }
  const message = r.result.message ?? {};
  const promptTokens = Number(message?.usage?.input_tokens ?? 0);
  const completionTokens = Number(message?.usage?.output_tokens ?? 0);
  if (message.stop_reason === "refusal") return { customId, ok: false, error: "refusal", promptTokens, completionTokens };
  if (message.stop_reason === "max_tokens") return { customId, ok: false, error: "max_tokens", promptTokens, completionTokens };
  const text = (message.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
  try {
    return { customId, ok: true, data: JSON.parse(text), promptTokens, completionTokens };
  } catch {
    return { customId, ok: false, error: "invalid_json", promptTokens, completionTokens };
  }
}

// ---------- Custo ----------

/** Português fica perto de 3 caracteres por token; arredondar para cima protege o teto de gasto. */
export const CHARS_PER_TOKEN = 3;

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function batchCostUsd(
  price: { input_per_1k_usd: number; output_per_1k_usd: number },
  promptTokens: number,
  completionTokens: number,
): number {
  const full = price.input_per_1k_usd * (promptTokens / 1000) + price.output_per_1k_usd * (completionTokens / 1000);
  return Number((full * BATCH_DISCOUNT).toFixed(6));
}

// ---------- Relatório: ganhas x perdidas ----------

export const REPORT_SCHEMA = obj({
  headline: str,
  winning_behaviors: arr(obj({ behavior: str, why_it_works: str, seen_in_won: str, seen_in_lost: str, examples: arr(str) })),
  losing_patterns: arr(obj({ pattern: str, what_to_do: str, examples: arr(str) })),
  where_conversations_die: arr(obj({ moment: str, share_of_lost: str, what_happens: str, what_to_do: str })),
  objections: arr(obj({ objection: str, frequency: str, answers_that_work: arr(str), answers_that_fail: arr(str) })),
  team_differences: arr(obj({ person: str, what_stands_out: str })),
  agent_prompt_guidelines: arr(str),
  open_questions: arr(str),
  markdown: str,
});

export interface ReportInputRow {
  opportunity_id: string;
  outcome: "won" | "lost";
  owner_name: string | null;
  stage_before_close: string | null;
  days_to_close: number;
  message_count: number;
  analysis: unknown;
}

export function buildReportSystemPrompt(profile: AnalysisProfile): string {
  return `Você compara conversas de vendas ganhas e perdidas de uma empresa para dizer o que funciona.
${businessBlock(profile)}

Você recebe a análise de cada conversa (já feita lendo a conversa inteira), com o resultado e quem atendeu.

Entregue:
- O que quem ganha faz de diferente, com a frequência nas ganhas e nas perdidas.
- Em que momento as conversas perdidas morrem, com a parcela aproximada das perdidas.
- As objeções mais comuns e as respostas que funcionam e que não funcionam, com citações curtas tiradas das análises.
- Diferenças entre as pessoas da equipe que aparecem nos dados.
- "agent_prompt_guidelines": regras curtas e práticas para um agente de IA que faz o primeiro atendimento pelo WhatsApp, tiradas do que funcionou. Uma regra por item.
- "open_questions": o que os dados não respondem e precisa de decisão da empresa.
- "markdown": o relatório completo para a equipe ler, em português simples, com títulos curtos.
Regras: baseie-se só nos dados recebidos, cite exemplos pelo código da oportunidade (8 primeiros caracteres), diga quando a base for pequena para concluir, e não invente números.`;
}

export function buildReportUserPrompt(rows: ReportInputRow[]): string {
  const won = rows.filter((r) => r.outcome === "won").length;
  const lines = rows.map((r) => JSON.stringify({
    codigo: r.opportunity_id.slice(0, 8),
    resultado: r.outcome === "won" ? "ganha" : "perdida",
    responsavel: r.owner_name ?? "sem responsável",
    etapa_antes_de_fechar: r.stage_before_close,
    dias_ate_fechar: Number(r.days_to_close.toFixed(1)),
    mensagens: r.message_count,
    analise: r.analysis,
  }));
  return `${rows.length} conversas analisadas: ${won} ganhas e ${rows.length - won} perdidas. Uma por linha:\n${lines.join("\n")}`;
}
