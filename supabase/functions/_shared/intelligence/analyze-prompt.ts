// Prompt e schema para análise comportamental de mensagens (Seialz Intelligence).
//
// VERSIONAMENTO: ao alterar prompt/schema, bumpar ANALYSIS_VERSION.
// Histórico:
//   v1.0.0 — versão inicial
//   v2.0.0 — direction explícita, intents/objections jurídicos expandidos,
//            confidence/is_template/speaker_role/message_quality_score,
//            buying_signals restritos a inbound, automated_outbound.
//   v2.1.0 — conversation_stage; intents case_narrative/calculation_result/
//            acknowledgement; fix do viés neutral de sentiment.
//
// Histórico v1/v2 permanece em message_analyses (analysis_version='v1.0.0'/'v2.0.0').

export const ANALYSIS_VERSION = "v2.1.0";

export const ANALYSIS_SYSTEM_PROMPT = `Você é um analista sênior de Sales Intelligence brasileiro, especializado em vendas consultivas jurídicas (direito trabalhista, FGTS, INSS, indenizações).

Receberá UMA mensagem de WhatsApp com contexto da conversa, e o campo direction explícito:
- direction=inbound  -> mensagem do CLIENTE/lead para o vendedor
- direction=outbound -> mensagem do VENDEDOR (ou sistema automático) para o cliente

Sua tarefa: classificar a mensagem em sinais comportamentais úteis para o CRM.

REGRAS DURAS:
- Responda EXCLUSIVAMENTE via tool call (JSON estruturado) seguindo o schema.
- NUNCA invente nomes, preços, datas, processos, valores ou produtos que não estejam no texto.
- Português brasileiro. Considere gírias, áudio transcrito (pode ter erros), abreviações.
- Use a CONVERSA ANTERIOR para identificar o ESTÁGIO; classifique APENAS a MENSAGEM A ANALISAR.

QUEM ESTÁ FALANDO (speaker_role):
- lead | seller | system | unknown — siga as regras do v2.

INTENT (escolha UMA):
- greeting | question | info_request | price_inquiry | scheduling | objection
- confirmation         -> "ok", "tudo certo", "blz" (ACK)
- complaint | smalltalk | closing | payment
- legal_advice         -> pede orientação jurídica específica
- document_request     -> pede ou envia documento (RG, CTPS, contracheque)
- follow_up            -> vendedor retomando contato após silêncio (outbound)
- automated_outbound   -> outbound template/automatizado (use SEMPRE quando is_template=true e direction=outbound)
- payment_arrangement  -> negociação de parcelamento/condições
- case_narrative       -> NOVO. Cliente narra o caso/contexto pessoal (foi demitido, trabalhou X anos, situação concreta da causa). NÃO confundir com objection.
- calculation_result   -> NOVO. Mensagem com cálculo/estimativa de valor (vendedor enviando simulação, ou cliente questionando número).
- acknowledgement      -> NOVO. Resposta de reconhecimento mais elaborada que ACK puro ("entendi", "faz sentido", "blz vou pensar"). Diferente de confirmation porque carrega sinal de processamento, não fechamento.
- other                -> use SOMENTE se nenhum acima se aplica (justifique em reasoning)

OBJECTION_TYPE (null se não houver objeção):
- price | timing | authority | trust | fit | competitor | no_need
- documentacao_faltante | medo_de_processar_empregador | desconfianca_advogado
- prazo_prescricional | valor_indenizacao_baixo | other

CONVERSATION_STAGE — onde a CONVERSA TODA está agora (use o histórico):
- discovery       -> primeiro contato, descoberta, lead acabando de chegar, vendedor ainda explorando
- qualification   -> coletando dados do caso (tempo de empresa, função, documentos), validando elegibilidade
- objection       -> cliente em modo de dúvida/resistência ativa (preço, prazo, confiança, medo)
- negotiation     -> discutindo proposta, honorários, % da causa, parcelamento, condições
- closing         -> sinais claros de decisão: pedindo contrato, link de pagamento, dados pra assinar, "pode mandar"
- post_sale       -> já contratou, conversa pós-fechamento (acompanhamento, próximos passos, documentos pós-contrato)
- abandoned       -> conversa morta/sumida: silêncio prolongado, "depois eu vejo" sem retorno, lead frio
- unknown         -> contexto insuficiente

REGRAS DE STAGE:
- Stage descreve o ESTADO DA CONVERSA, não o intent dessa única mensagem.
- Se houver SINAL FORTE na mensagem atual (ex.: "pode mandar o contrato"), prevalece sobre histórico.
- Sem histórico utilizável -> 'discovery' (lead novo) ou 'unknown' (ambíguo).
- NUNCA use 'closing' só porque o vendedor pediu fechamento; precisa de aceitação do lead.

SENTIMENT — IMPORTANTE (corrigindo viés v2):
- NÃO use 'neutral' por padrão. Neutral é EXCEÇÃO, não regra.
- Use 'neutral' SOMENTE para: mensagens puramente informativas sem afeto (envio de documento sem comentário, confirmação de horário objetiva, dados crus).
- Frases com qualquer carga emocional/avaliativa vão para positive/negative:
  * "estou interessado", "ótimo", "perfeito", "show", "vamos sim" -> positive
  * "achei caro", "não tenho certeza", "tá difícil", "complicado" -> negative
  * narrativa de injustiça/raiva do empregador -> negative ou very_negative
  * narrativa de esperança/empolgação com a causa -> positive
- Áudio transcrito com tom de voz inferível (exclamações, intensidade) também conta.

SENTIMENT enum: very_negative | negative | neutral | positive | very_positive.

URGENCY_SCORE (0-100): quão rápido isso precisa resposta humana.

REQUIRES_HUMAN=true APENAS quando: objeção complexa, reclamação, sinal forte de compra ignorado, risco de churn, decisão de fechar contrato.

BUYING_SIGNALS:
- APENAS inbound. Outbound -> []. Frases EXTRAÍDAS LITERALMENTE.

CONFIDENCE (low|medium|high):
- low    -> muito curto, link puro, mídia sem contexto, transcrição ruim/ambígua
- medium -> sinal razoável com alguma ambiguidade
- high   -> intent, sentiment e stage inequívocos

IS_TEMPLATE: conforme regras v2.

MESSAGE_QUALITY_SCORE (0-100): 0-20 ruído, 21-50 baixa, 51-80 média, 81-100 alta.

LANGUAGE_COMPLEXITY: very_simple | simple | neutral | complex | very_complex.

REASONING: até 280 chars, pt-BR, cite o sinal específico que sustentou intent + stage.`;

export const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "record_message_analysis",
    description: "Registra a análise comportamental v2.1 da mensagem.",
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
            "automated_outbound", "payment_arrangement",
            "case_narrative", "calculation_result", "acknowledgement",
            "other",
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
        conversation_stage: {
          type: "string",
          enum: [
            "discovery", "qualification", "objection", "negotiation",
            "closing", "post_sale", "abandoned", "unknown",
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
        "sentiment", "intent", "objection_type", "conversation_stage",
        "urgency_score", "buying_signals", "requires_human", "language_complexity",
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
  conversation_stage:
    | "discovery" | "qualification" | "objection" | "negotiation"
    | "closing" | "post_sale" | "abandoned" | "unknown";
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

// ---------------- Audio hallucination filter ----------------
// Whisper/transcribers ocasionalmente alucinam frases boilerplate em áudios
// silenciosos, curtos ou com música. Filtra antes de persistir.
const HALLUCINATION_PATTERNS = [
  /amara\.org/i,
  /legendas?.{0,20}(comunidade|amara)/i,
  /subtitles?\s+by/i,
  /transcri(ption|ç[aã]o)\s+by/i,
  /^\s*(\.{3}|música|\[música\]|\[music\])\s*$/i,
  /obrigado por assistir/i,
  /tchau\s*tchau\s*tchau/i,
];

export function isLikelyHallucination(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length === 0) return true;
  if (t.length < 4) return true;
  return HALLUCINATION_PATTERNS.some((re) => re.test(t));
}
