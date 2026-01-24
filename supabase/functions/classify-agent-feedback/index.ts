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
  classification: 'KB_FACT' | 'AGENT_RULE' | 'MISSING_INFO' | 'FLOW_TOOL' | 'FORMATTING';
  reason: string;
  confidence: number;
  patch: {
    kb_update?: {
      title: string;
      content: string;
      type: 'faq' | 'policy' | 'product' | 'general';
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
    formatting_update?: {
      max_consecutive_newlines: number;
      strip_empty_lines: boolean;
    };
  };
}

const CLASSIFIER_SYSTEM_PROMPT = `Você é um classificador de feedback do agente de IA.

Sua tarefa é analisar o feedback do usuário sobre uma resposta do agente e classificar em:

1) KB_FACT - Problema de FATO/CONTEÚDO
   → O agente disse algo factualmente incorreto
   → Preço/prazo/documento/política errada
   → ⚠️ AGENTE INVENTOU informação que não existe (PIX direto, QR code manual, chave Pix, CPF, dados bancários)
     Motivo: O conteúdo CORRETO precisa ser adicionado à Base de Conhecimento
   → Destino: BASE DE CONHECIMENTO (não regras do agente!)
   
2) AGENT_RULE - Problema de TOM/ESTILO/COMPORTAMENTO
   → Resposta muito longa, robótica, sem empatia
   → Não perguntou nome, não cumprimentou adequadamente
   → Ignorou instruções de estilo
   → ⚠️ NÃO inclui inventar dados - isso é KB_FACT!
   → ⚠️ NÃO inclui formatação (quebras de linha) - isso é FORMATTING!
   → Destino: REGRAS DO AGENTE
   
3) MISSING_INFO - FALTA DE INFORMAÇÃO
   → Agente admitiu não saber ("depende", "não sei", "preciso verificar")
   → Informação simplesmente não existe na KB
   → Destino: PERGUNTAS PENDENTES (wizard)
   
4) FLOW_TOOL - Problema de USO DE FERRAMENTA
   → Deveria ter chamado send_payment_link mas não chamou
   → Handoff/oportunidade na ordem errada
   → Agendamento precoce ou atrasado
   → Destino: GATILHOS DE FERRAMENTA

5) FORMATTING - Problema de FORMATAÇÃO/ESTRUTURA
   → Feedback menciona: quebras de linha excessivas, espaçamentos, parágrafos desnecessários
   → Palavras-chave: "linha", "pular", "espaço", "parágrafo", "curto", "longo", "quebra", "enter"
   → Feedback como: "para de pular linha", "sem linhas em branco", "texto muito espaçado"
   → Destino: CONFIGURAÇÃO DE FORMATAÇÃO (não regras individuais!)
   → Patch: { "formatting_update": { "max_consecutive_newlines": 1, "strip_empty_lines": true } }

⚠️ REGRA CRÍTICA PARA PAGAMENTO:
- Agente INVENTOU PIX/QR/chave/CPF/dados bancários que NÃO EXISTEM → KB_FACT
  (O usuário vai fornecer o conteúdo correto para a Base de Conhecimento)
- Agente DEVERIA ter usado ferramenta send_payment_link → FLOW_TOOL
- TOM/ESTILO da resposta sobre pagamento foi ruim → AGENT_RULE

⚠️ REGRA CRÍTICA PARA FORMATAÇÃO:
- Qualquer feedback sobre "pular linha", "quebra de linha", "linhas em branco", "muito espaçado" → FORMATTING
- NÃO é AGENT_RULE, é FORMATTING!

INSTRUÇÕES PARA kb_update.content:
- Gere o texto CORRETO que deve estar na Base de Conhecimento
- NÃO copie a resposta errada do agente - use o feedback do usuário
- Seja EXPLÍCITO e CLARO (ex: "A empresa NÃO aceita..." ou "SOMENTE através de...")
- Escolha o type correto:
  → 'policy' = regras/políticas da empresa (pagamento, cancelamento, prazo, regras)
  → 'faq' = perguntas frequentes gerais
  → 'product' = informações de produto/serviço
  → 'general' = outros

EXEMPLO PARA POLÍTICA DE PAGAMENTO:
Se o usuário disse "não aceitamos PIX direto, só pelo link", gerar:
{
  "classification": "KB_FACT",
  "reason": "Agente informou política de pagamento incorreta",
  "confidence": 0.95,
  "patch": {
    "kb_update": {
      "title": "Política de Pagamento - PIX e Cartão",
      "type": "policy",
      "content": "Formas de pagamento aceitas: PIX e cartão de crédito, porém SOMENTE através do link de pagamento oficial.",
      "tags": ["pagamento", "política", "PIX", "link", "cartão"]
    }
  }
}

EXEMPLO PARA FORMATAÇÃO:
Se o usuário disse "para de pular linha" ou "não usar linhas em branco", gerar:
{
  "classification": "FORMATTING",
  "reason": "Usuário quer que o agente evite quebras de linha excessivas",
  "confidence": 0.95,
  "patch": {
    "formatting_update": {
      "max_consecutive_newlines": 1,
      "strip_empty_lines": true
    }
  }
}

LEMBRE-SE:
- "Inventar dados" = problema de CONTEÚDO (KB_FACT), não de comportamento
- "Estilo ruim" = problema de COMPORTAMENTO (AGENT_RULE)
- "Não usou ferramenta" = problema de FLUXO (FLOW_TOOL)
- "Pular linha / linhas em branco / espaçamento" = problema de FORMATAÇÃO (FORMATTING)

SAÍDA (SEMPRE JSON PURO, sem markdown):
{
  "classification": "KB_FACT|AGENT_RULE|MISSING_INFO|FLOW_TOOL|FORMATTING",
  "reason": "explicação curta",
  "confidence": 0.0-1.0,
  "patch": {
    "kb_update": { "title": "", "type": "policy|faq|product|general", "content": "", "tags": [] },
    "agent_rule_update": { "rule": "", "example_good_response": "" },
    "wizard_question": { "question": "", "slot": "" },
    "flow_tool_update": { "rule": "", "trigger": "" },
    "formatting_update": { "max_consecutive_newlines": 1, "strip_empty_lines": true }
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
