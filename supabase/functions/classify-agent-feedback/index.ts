import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClassifyFeedbackRequest {
  customerMessage: string;
  agentAnswer: string;
  userFeedback: string;
  ragContext?: string;
  agentRulesSummary?: string;
  agentId: string;
  organizationId: string;
}

interface ClassificationResult {
  classification: 'KB_FACT' | 'AGENT_RULE' | 'MISSING_INFO' | 'FLOW_TOOL';
  reason: string;
  confidence: number;
  patch: {
    kb_update?: {
      title: string;
      content: string;
      tags: string[];
    };
    agent_rule_update?: {
      rule: string;
      example_good_response: string;
    };
    wizard_question?: {
      question: string;
      slot: string;
    };
    flow_tool_update?: {
      rule: string;
      trigger: string;
    };
  };
}

const CLASSIFIER_SYSTEM_PROMPT = `Você é um classificador de feedback do agente de IA.

Sua tarefa é analisar o feedback do usuário sobre uma resposta do agente e classificar em:

1) KB_FACT - Problema de FATO/CONTEÚDO (preço, prazo, documento, política errada)
   → O agente disse algo factualmente incorreto que deveria estar na Base de Conhecimento
   
2) AGENT_RULE - Problema de COMPORTAMENTO/ESTILO (muito longo, robótico, sem empatia, sem CTA)
   → O agente respondeu de forma inadequada em tom, tamanho ou abordagem
   ⚠️ INCLUI: Agente inventando informações (PIX, QR code, chave, dados bancários)
   
3) MISSING_INFO - FALTA DE INFORMAÇÃO (dado não existe na KB, agente chutou ou ficou travado)
   → O agente não tinha informação suficiente para responder
   
4) FLOW_TOOL - Problema de FERRAMENTA/FLUXO (handoff errado, oportunidade criada cedo demais)
   → O agente usou ou deixou de usar uma ferramenta quando deveria
   ⚠️ INCLUI: Deveria ter usado send_payment_link mas não usou

REGRAS DE CLASSIFICAÇÃO:
- Preço/prazo/documentos/política errada → KB_FACT
- Longo demais, robótico, sem empatia, ignorou correção, não perguntou nome → AGENT_RULE
- Informação não existe ou está vaga ("depende", "não sei") → MISSING_INFO
- Handoff/oportunidade/agendamento na ordem errada → FLOW_TOOL

⚠️ REGRAS ESPECIAIS PARA PAGAMENTO:
- Se o agente INVENTOU PIX, QR code, chave Pix, dados bancários → AGENT_RULE (regra "nunca inventar dados de pagamento")
- Se o agente DEVERIA ter enviado link de pagamento mas não enviou → FLOW_TOOL (trigger para send_payment_link)
- Se o link de pagamento está ERRADO (produto/valor diferente) → KB_FACT (atualizar base com link correto)

SAÍDA (SEMPRE JSON PURO, sem markdown):
{
  "classification": "KB_FACT|AGENT_RULE|MISSING_INFO|FLOW_TOOL",
  "reason": "explicação curta",
  "confidence": 0.0-1.0,
  "patch": {
    "kb_update": { "title": "", "content": "", "tags": [] },
    "agent_rule_update": { "rule": "", "example_good_response": "" },
    "wizard_question": { "question": "", "slot": "" },
    "flow_tool_update": { "rule": "", "trigger": "" }
  }
}

Retorne apenas os campos relevantes dentro de "patch". Se não se aplicar, deixe como null ou omita.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      customerMessage,
      agentAnswer,
      userFeedback,
      ragContext,
      agentRulesSummary,
    }: ClassifyFeedbackRequest = await req.json();

    // Build the user message for classification
    const userMessage = `CONTEXTO:
- Mensagem do cliente: "${customerMessage || 'N/A'}"
- Resposta do agente: "${agentAnswer}"
- Feedback do usuário (resposta ideal): "${userFeedback}"
${ragContext ? `- RAG_CONTEXT usado: ${ragContext.slice(0, 500)}...` : '- RAG_CONTEXT: Nenhum'}
${agentRulesSummary ? `- Regras do agente atuais: ${agentRulesSummary}` : ''}

Classifique este feedback e gere o patch apropriado.`;

    // Call the AI gateway
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway returned ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON response - handle potential markdown code blocks
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.slice(7);
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.slice(3);
    }
    if (cleanContent.endsWith('```')) {
      cleanContent = cleanContent.slice(0, -3);
    }
    cleanContent = cleanContent.trim();

    let result: ClassificationResult;
    try {
      result = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', cleanContent);
      // Return a default classification if parsing fails
      result = {
        classification: 'AGENT_RULE',
        reason: 'Não foi possível classificar automaticamente. Tratando como regra de comportamento.',
        confidence: 0.5,
        patch: {
          agent_rule_update: {
            rule: `Quando o cliente receber uma resposta similar a "${agentAnswer.slice(0, 50)}..."`,
            example_good_response: userFeedback,
          },
        },
      };
    }

    // Ensure confidence is a number
    if (typeof result.confidence !== 'number') {
      result.confidence = 0.8;
    }

    console.log('Classification result:', result.classification, result.confidence);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in classify-agent-feedback:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        classification: 'AGENT_RULE',
        reason: 'Erro na classificação automática',
        confidence: 0,
        patch: {},
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
