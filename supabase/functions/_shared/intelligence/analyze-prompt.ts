// Prompt e schema para análise comportamental de mensagens (Seialz Intelligence MVP).
// Versionar SEMPRE que o prompt mudar: refletir em ANALYSIS_VERSION e regravar
// message_analyses + messages.ai_analysis_version para permitir reprocessamento.

export const ANALYSIS_VERSION = "v1.0.0";

export const ANALYSIS_SYSTEM_PROMPT = `Você é um analista sênior de Sales Intelligence brasileiro.
Receberá UMA mensagem de WhatsApp (vendedor->cliente OU cliente->vendedor) com contexto mínimo da conversa.
Sua tarefa: classificar a mensagem em sinais comportamentais úteis para CRM.

REGRAS DURAS:
- Responda EXCLUSIVAMENTE com JSON válido seguindo o schema da tool.
- Nunca invente nomes, preços, datas ou produtos que não estejam no texto.
- Português brasileiro. Considere gírias, áudio transcrito (pode ter erros) e abreviações.
- Se a mensagem é do vendedor (direction=outbound), avalie qualidade/postura.
- Se é do cliente (direction=inbound), avalie intenção e sinais de compra.
- urgency_score (0-100): quão rápido isso precisa de resposta humana.
- requires_human=true APENAS para objeções complexas, reclamações, sinais fortes de compra ignorados ou risco de churn/perda.
- buying_signals: lista curta de frases EXTRAÍDAS do texto (não parafraseie).
- objection_type: null se não houver. Valores aceitos: price, timing, authority, trust, fit, competitor, no_need, other.
- intent: greeting, question, info_request, price_inquiry, scheduling, objection, confirmation, complaint, smalltalk, closing, payment, other.
- sentiment: very_negative, negative, neutral, positive, very_positive.`;

export const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "record_message_analysis",
    description: "Registra a análise comportamental da mensagem.",
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
            "payment", "other",
          ],
        },
        objection_type: {
          type: ["string", "null"],
          enum: [null, "price", "timing", "authority", "trust", "fit", "competitor", "no_need", "other"],
        },
        urgency_score: { type: "integer", minimum: 0, maximum: 100 },
        buying_signals: {
          type: "array",
          items: { type: "string" },
          maxItems: 5,
        },
        requires_human: { type: "boolean" },
        language_complexity: {
          type: "string",
          enum: ["very_simple", "simple", "neutral", "complex", "very_complex"],
        },
        reasoning: { type: "string", maxLength: 280 },
      },
      required: [
        "sentiment", "intent", "objection_type", "urgency_score",
        "buying_signals", "requires_human", "language_complexity", "reasoning",
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
  reasoning: string;
};
