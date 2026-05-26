// Prompt e schema para análise comportamental de mensagens (Seialz Intelligence).
//
// VERSIONAMENTO: ao alterar prompt/schema, bumpar ANALYSIS_VERSION.
// Histórico:
//   v1.0.0 — versão inicial (mantida intacta para comparação)
//   v2.0.0 — direction explícita, intents/objections jurídicos expandidos,
//            campos confidence/is_template/speaker_role/message_quality_score,
//            buying_signals restritos a inbound, outbound automático/template
//            classificado como automated_outbound.
//
// Histórico v1 permanece em message_analyses (analysis_version='v1.0.0').

export const ANALYSIS_VERSION = "v2.0.0";

export const ANALYSIS_SYSTEM_PROMPT = `Você é um analista sênior de Sales Intelligence brasileiro, especializado em vendas consultivas jurídicas (direito trabalhista, FGTS, INSS, indenizações).

Receberá UMA mensagem de WhatsApp com contexto mínimo da conversa, e o campo direction explícito:
- direction=inbound  -> mensagem enviada pelo CLIENTE/lead para o vendedor
- direction=outbound -> mensagem enviada pelo VENDEDOR (ou sistema automático) para o cliente

Sua tarefa: classificar a mensagem em sinais comportamentais úteis para o CRM.

REGRAS DURAS:
- Responda EXCLUSIVAMENTE via tool call (JSON estruturado) seguindo o schema.
- NUNCA invente nomes, preços, datas, processos, valores ou produtos que não estejam no texto.
- Português brasileiro. Considere gírias, áudio transcrito (pode ter erros), abreviações.
- Use a CONVERSA ANTERIOR apenas como contexto; classifique APENAS a MENSAGEM A ANALISAR.

QUEM ESTÁ FALANDO (speaker_role):
- lead      -> cliente/lead (direction=inbound)
- seller    -> vendedor humano (direction=outbound, mensagem manual, personalizada, com nome do cliente etc.)
- system    -> mensagem automática/template (direction=outbound, parece scripted, links genéricos, opt-in, boas-vindas padrão, lembrete agendado)
- unknown   -> ambíguo

MENSAGEM AUTOMÁTICA / TEMPLATE (is_template=true) — sinais típicos:
- texto com variáveis preenchidas ({nome}, {empresa})
- saudação genérica + chamada padronizada que se repete em escala
- link único sem contexto conversacional
- mensagem de opt-in, boas-vindas, lembrete de pagamento agendado
- ausência de tom natural / sem responder a algo do cliente

INTENT (escolha UMA):
- greeting            -> oi, bom dia, tudo bem
- question            -> pergunta genérica
- info_request        -> pede informação sobre serviço/produto
- price_inquiry       -> pergunta preço/valores/honorários
- scheduling          -> agendar, marcar reunião/ligação
- objection           -> objeção explícita (ver objection_type)
- confirmation        -> "ok", "tudo certo", "obrigado", "blz" (ACK)
- complaint           -> reclamação, frustração
- smalltalk           -> conversa fiada
- closing             -> intenção clara de fechar/contratar
- payment             -> pagou, vai pagar, pediu link de pagamento
- legal_advice        -> pede orientação jurídica específica (direito a receber, prazo, etc.)
- document_request    -> pede ou envia documento (RG, CTPS, contracheque, processo)
- follow_up           -> vendedor retomando contato após silêncio (outbound)
- automated_outbound  -> outbound template/automatizado (use SEMPRE quando is_template=true e direction=outbound)
- payment_arrangement -> negociação de parcelamento, condições de pagamento
- other               -> use SOMENTE se nenhum acima se aplica (justifique em reasoning)

OBJECTION_TYPE (null se não houver objeção):
- price                          -> "tá caro", "não tenho como pagar"
- timing                         -> "agora não", "depois eu vejo"
- authority                      -> "preciso falar com esposa/sócio"
- trust                          -> "não conheço vocês"
- fit                            -> "não é pra mim"
- competitor                     -> "já estou com outro advogado"
- no_need                        -> "não preciso disso"
- documentacao_faltante          -> não tem CTPS, contrato, holerites, comprovantes
- medo_de_processar_empregador   -> medo de retaliação, demissão, queimar na empresa
- desconfianca_advogado          -> medo de golpe, advogado picareta, taxa escondida
- prazo_prescricional            -> "já passou o prazo", "é antigo demais"
- valor_indenizacao_baixo        -> "vale pouco", "não compensa"
- other                          -> qualquer outra objeção (justifique)

SENTIMENT: very_negative, negative, neutral, positive, very_positive.

URGENCY_SCORE (0-100): quão rápido isso precisa resposta humana.

REQUIRES_HUMAN=true APENAS quando: objeção complexa, reclamação, sinal forte de compra ignorado, risco de churn/perda, decisão de fechar contrato.

BUYING_SIGNALS:
- APENAS quando direction=inbound (sinais vêm do cliente, NUNCA do vendedor).
- Lista curta de frases EXTRAÍDAS LITERALMENTE do texto (sem parafrasear).
- Se direction=outbound -> SEMPRE retorne lista vazia [].

CONFIDENCE (low|medium|high):
- low    -> mensagem muito curta, isolada, link puro, mídia sem contexto, texto ambíguo, transcrição ruim
- medium -> sinal razoável mas com ambiguidade
- high   -> intent e sentiment inequívocos, contexto claro

IS_TEMPLATE (boolean): conforme regras acima.

MESSAGE_QUALITY_SCORE (0-100):
- 0-20   -> ruído (ACK, mídia sem texto, link puro)
- 21-50  -> baixa (vago, sem contexto)
- 51-80  -> média (informativa, contextual)
- 81-100 -> alta (rica em sinal: objeção elaborada, decisão de compra, documento detalhado)

LANGUAGE_COMPLEXITY: very_simple, simple, neutral, complex, very_complex.

REASONING: justifique em ATÉ 280 caracteres, em pt-BR, citando o sinal específico.`;

export const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "record_message_analysis",
    description: "Registra a análise comportamental v2 da mensagem.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        sentiment: {
          type: "string",
          enum: ["very_negative", "negative", "neutral", "positive", "very_positive"],
        },
        intent: {
          type: "string",
          enum: [
            "greeting", "question", "info_request", "price_inquiry", "scheduling",
            "objection", "confirmation", "complaint", "smalltalk", "closing",
            "payment", "legal_advice", "document_request", "follow_up",
            "automated_outbound", "payment_arrangement", "other",
          ],
        },
        objection_type: {
          type: ["string", "null"],
          enum: [
            null,
            "price", "timing", "authority", "trust", "fit", "competitor", "no_need",
            "documentacao_faltante", "medo_de_processar_empregador",
            "desconfianca_advogado", "prazo_prescricional", "valor_indenizacao_baixo",
            "other",
          ],
        },
        urgency_score: { type: "integer", minimum: 0, maximum: 100 },
        buying_signals: {
          type: "array",
          items: { type: "string" },
          maxItems: 5,
          description: "APENAS para inbound. Outbound deve retornar [].",
        },
        requires_human: { type: "boolean" },
        language_complexity: {
          type: "string",
          enum: ["very_simple", "simple", "neutral", "complex", "very_complex"],
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        is_template: { type: "boolean" },
        speaker_role: { type: "string", enum: ["lead", "seller", "system", "unknown"] },
        message_quality_score: { type: "integer", minimum: 0, maximum: 100 },
        reasoning: { type: "string", maxLength: 280 },
      },
      required: [
        "sentiment", "intent", "objection_type", "urgency_score",
        "buying_signals", "requires_human", "language_complexity",
        "confidence", "is_template", "speaker_role", "message_quality_score",
        "reasoning",
      ],
    },
  },
};

export type MessageAnalysisPayload = {
  sentiment: "very_negative" | "negative" | "neutral" | "positive" | "very_positive";
  intent: string;
  objection_type: string | null;
  urgency_score: number;
  buying_signals: string[];
  requires_human: boolean;
  language_complexity: string;
  confidence: "low" | "medium" | "high";
  is_template: boolean;
  speaker_role: "lead" | "seller" | "system" | "unknown";
  message_quality_score: number;
  reasoning: string;
};

// ---------------- Pre-LLM filter ----------------
//
// Decide se a mensagem deve ir para o LLM ou ser descartada/registrada como
// análise sintética. Retorna { skip: true, reason } quando NÃO deve ir.
//
const URL_ONLY_RE = /^\s*(https?:\/\/\S+|www\.\S+)\s*$/i;
const ACK_RE = /^\s*(ok|okay|okk+|blz|beleza|valeu|vlw|obg|obgd|obrigad[oa]|tmj|show|certo|td bem|tudo bem|👍+|👌+|✅+|🙏+)\s*[.!?]*\s*$/i;

export function preLlmFilter(input: {
  content: string | null | undefined;
  direction: "inbound" | "outbound" | string | null | undefined;
  mediaType: string | null | undefined;
}): { skip: false } | { skip: true; reason: string } {
  const raw = (input.content ?? "").trim();
  const isAudio = (input.mediaType ?? "").toLowerCase().startsWith("audio");
  const hasMedia = !!input.mediaType && input.mediaType.length > 0 && !isAudio;

  if (!raw && !hasMedia && !isAudio) return { skip: true, reason: "empty_no_media" };
  if (raw.length > 0 && raw.length < 5 && !hasMedia) return { skip: true, reason: "too_short" };
  if (URL_ONLY_RE.test(raw)) return { skip: true, reason: "url_only" };
  if (hasMedia && raw.length < 3) return { skip: true, reason: "media_no_context" };
  if (input.direction === "outbound" && ACK_RE.test(raw)) return { skip: true, reason: "outbound_ack" };

  return { skip: false };
}
