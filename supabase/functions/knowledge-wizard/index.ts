import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type KnowledgeType = 'general' | 'faq_only' | 'policy' | 'product';

interface WizardRequest {
  recentMessages: ChatMessage[];
  currentSlots: Record<string, string>;
  userMessage: string;
  knowledgeType?: KnowledgeType;
}

interface WizardResponse {
  message: string;
  stage: 'discovery' | 'slots' | 'faq_generation' | 'policy_slots' | 'product_slots' | 'complete';
  nextQuestion: string | null;
  slotUpdates: Record<string, string>;
  missingSlots: string[];
  suggestedQuestions: string[];
  faqAnswered?: { question: string; answer: string };
}

const GENERAL_SYSTEM_PROMPT = `Você é um Wizard conversacional para coletar informações e gerar uma Base de Conhecimento COMPLETA.

Você NÃO é consultor e NÃO deve afirmar fatos externos. Você só coleta e organiza o que o usuário informa.

REGRAS INEGOCIÁVEIS
- Faça APENAS 1 pergunta por vez.
- Seja conversacional e curto (máx 2 linhas).
- Se a resposta for vaga ("depende", "varia"), peça concretização.
- Não invente preço, prazos, documentos, políticas.

PROCESSO (stages)
1) discovery (1–2 perguntas): entender o que oferece.
2) slots (perguntas até preencher os campos mínimos).
3) faq_generation: sugerir 5–10 perguntas frequentes.
4) complete: quando slots mínimos + algumas FAQs estiverem respondidas.

FORMATO DE RESPOSTA (SEMPRE JSON VÁLIDO)
{
  "message": "mensagem curta",
  "stage": "discovery|slots|faq_generation|complete",
  "nextQuestion": "uma única pergunta ou null",
  "slotUpdates": { "campo": "valor" },
  "missingSlots": ["campo1","campo2"],
  "suggestedQuestions": ["..."],
  "faqAnswered": { "question": "pergunta", "answer": "resposta" } ou null
}

CAMPOS MÍNIMOS (slots)
- offer, target_customer, includes, excludes, price, timeline, required_inputs, next_step, policies

REGRAS DE TRANSIÇÃO:
- Só vá para faq_generation quando TODOS os slots mínimos estiverem preenchidos.
- Em faq_generation, sugira 5-10 perguntas em suggestedQuestions.
- Quando o usuário responde uma FAQ, retorne faqAnswered com a pergunta e resposta.
- Após 3+ FAQs, mude para complete.
- Em complete, nextQuestion DEVE ser null.`;

const FAQ_ONLY_SYSTEM_PROMPT = `Você é um Wizard conversacional para coletar APENAS Perguntas Frequentes (FAQs).

REGRAS
- Pergunte sobre qual produto/serviço são as FAQs (se não souber).
- Sugira 5-10 perguntas frequentes que clientes fazem.
- Colete as respostas do usuário para cada pergunta.
- Seja conversacional e curto.

PROCESSO
1) faq_generation: sugerir perguntas e coletar respostas.
2) complete: após 3+ FAQs respondidas.

FORMATO DE RESPOSTA (SEMPRE JSON VÁLIDO)
{
  "message": "mensagem curta",
  "stage": "faq_generation|complete",
  "nextQuestion": "pergunta ou null",
  "slotUpdates": {},
  "missingSlots": [],
  "suggestedQuestions": ["pergunta1", "pergunta2", ...],
  "faqAnswered": { "question": "pergunta", "answer": "resposta" } ou null
}

REGRAS DE TRANSIÇÃO:
- Comece em faq_generation com sugestões de perguntas.
- Quando o usuário responde uma pergunta, identifique qual e retorne em faqAnswered.
- Após 3+ FAQs, mude para complete.`;

const POLICY_SYSTEM_PROMPT = `Você é um Wizard conversacional para coletar POLÍTICAS do negócio.

REGRAS
- Colete uma política por vez.
- Seja específico sobre os termos e condições.
- Pergunte sobre exceções e casos especiais.

PROCESSO
1) policy_slots: coletar cada política.
2) complete: quando políticas principais estiverem definidas.

FORMATO DE RESPOSTA (SEMPRE JSON VÁLIDO)
{
  "message": "mensagem curta",
  "stage": "policy_slots|complete",
  "nextQuestion": "pergunta ou null",
  "slotUpdates": { "campo": "valor" },
  "missingSlots": ["campo1","campo2"],
  "suggestedQuestions": [],
  "faqAnswered": null
}

CAMPOS DE POLÍTICAS
- refund_policy: Política de Reembolso (quando permite, prazos, condições)
- cancellation_policy: Política de Cancelamento (como funciona, multas)
- warranty: Garantia (duração, o que cobre)
- terms: Termos de Uso (regras gerais)
- privacy: Privacidade (tratamento de dados)

REGRAS DE TRANSIÇÃO:
- Colete pelo menos 2-3 políticas antes de ir para complete.
- Em complete, nextQuestion DEVE ser null.`;

const PRODUCT_SYSTEM_PROMPT = `Você é um Wizard conversacional para documentar um PRODUTO ou SERVIÇO específico.

REGRAS
- Foque em um único produto/serviço por vez.
- Colete detalhes técnicos e comerciais.
- Seja objetivo e organizado.

PROCESSO
1) product_slots: coletar informações do produto.
2) faq_generation: sugerir FAQs específicas do produto.
3) complete: quando informações + algumas FAQs estiverem prontas.

FORMATO DE RESPOSTA (SEMPRE JSON VÁLIDO)
{
  "message": "mensagem curta",
  "stage": "product_slots|faq_generation|complete",
  "nextQuestion": "pergunta ou null",
  "slotUpdates": { "campo": "valor" },
  "missingSlots": ["campo1","campo2"],
  "suggestedQuestions": ["..."],
  "faqAnswered": { "question": "pergunta", "answer": "resposta" } ou null
}

CAMPOS DO PRODUTO
- product_name: Nome do Produto/Serviço
- description: Descrição detalhada
- features: Características/Funcionalidades
- price: Preço ou faixa de preço
- availability: Disponibilidade (imediata, prazo, sob demanda)
- target_customer: Para quem é indicado

REGRAS DE TRANSIÇÃO:
- Após coletar os campos, vá para faq_generation.
- Sugira FAQs específicas sobre o produto.
- Após 2-3 FAQs, mude para complete.`;

function getSystemPrompt(knowledgeType: KnowledgeType): string {
  switch (knowledgeType) {
    case 'faq_only':
      return FAQ_ONLY_SYSTEM_PROMPT;
    case 'policy':
      return POLICY_SYSTEM_PROMPT;
    case 'product':
      return PRODUCT_SYSTEM_PROMPT;
    default:
      return GENERAL_SYSTEM_PROMPT;
  }
}

function buildContextPrompt(slots: Record<string, string>, messages: ChatMessage[], userMessage: string, knowledgeType: KnowledgeType): string {
  const slotsJson = Object.keys(slots).length > 0 ? JSON.stringify(slots, null, 2) : '{}';
  
  const formattedMessages = messages.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n');
  
  return `Tipo de conhecimento: ${knowledgeType}
Slots coletados: ${slotsJson}
Últimas mensagens:
${formattedMessages}

Última mensagem do usuário: ${userMessage}`;
}

async function callLovableAI(messages: Array<{role: string; content: string}>): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI Gateway error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    if (response.status === 402) {
      throw new Error("PAYMENT_REQUIRED");
    }
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseWizardResponse(responseText: string): WizardResponse {
  let jsonStr = responseText.trim();
  
  // Remove markdown code blocks if present
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();
  
  const parsed = JSON.parse(jsonStr);
  
  if (!parsed.message || !parsed.stage) {
    throw new Error("Missing required fields in response");
  }
  
  return {
    message: parsed.message,
    stage: parsed.stage,
    nextQuestion: parsed.nextQuestion ?? null,
    slotUpdates: parsed.slotUpdates || {},
    missingSlots: parsed.missingSlots || [],
    suggestedQuestions: parsed.suggestedQuestions || [],
    faqAnswered: parsed.faqAnswered ?? undefined,
  };
}

async function callWithRetry(messages: Array<{role: string; content: string}>): Promise<WizardResponse> {
  const responseText = await callLovableAI(messages);
  
  try {
    return parseWizardResponse(responseText);
  } catch (parseError) {
    console.log("JSON inválido, tentando retry...", parseError);
    
    const retryMessages = [
      ...messages,
      { role: "assistant", content: responseText },
      { role: "user", content: "Sua resposta anterior não era JSON válido. Retorne APENAS o JSON, sem markdown, sem texto adicional. Comece com { e termine com }." }
    ];
    
    const retryResponseText = await callLovableAI(retryMessages);
    
    try {
      return parseWizardResponse(retryResponseText);
    } catch {
      console.log("Retry também falhou, usando fallback");
      return {
        message: "Desculpe, tive um problema técnico. Pode repetir sua última resposta?",
        stage: "slots",
        nextQuestion: "Pode repetir sua última resposta?",
        slotUpdates: {},
        missingSlots: [],
        suggestedQuestions: [],
      };
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recentMessages, currentSlots, userMessage, knowledgeType = 'general' } = await req.json() as WizardRequest;
    
    const systemPrompt = getSystemPrompt(knowledgeType);
    const contextPrompt = buildContextPrompt(currentSlots || {}, recentMessages || [], userMessage || "", knowledgeType);
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: contextPrompt }
    ];
    
    const wizardResponse = await callWithRetry(messages);
    
    return new Response(JSON.stringify(wizardResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error("Knowledge wizard error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage === "RATE_LIMITED") {
      return new Response(
        JSON.stringify({ error: "Taxa de requisições excedida. Aguarde um momento e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (errorMessage === "PAYMENT_REQUIRED") {
      return new Response(
        JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: "Erro ao processar wizard. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
