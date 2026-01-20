import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Question templates per content type
const questionTemplates: Record<string, string[]> = {
  product: [
    "Qual o nome exato do produto/serviço?",
    "Qual o preço e formas de pagamento aceitas?",
    "Quais são os principais benefícios e diferenciais?",
    "Tem garantia? Qual o prazo?",
    "Como funciona a entrega ou prestação do serviço?",
  ],
  faq: [
    "Qual a pergunta exata que os clientes costumam fazer?",
    "Qual a resposta completa e correta para essa pergunta?",
    "Existem variações dessa pergunta?",
    "Há links ou recursos adicionais que podem ajudar?",
  ],
  policy: [
    "Qual o nome/título desta política?",
    "Quais são as regras principais?",
    "Quais são as exceções ou casos especiais?",
    "Qual o prazo de validade ou quando se aplica?",
  ],
  instruction: [
    "Qual o objetivo desta instrução?",
    "Quais são os passos a seguir em ordem?",
    "Quais erros comuns devem ser evitados?",
    "Em que situações esta instrução deve ser aplicada?",
  ],
  general: [
    "Sobre o que é essa informação?",
    "Quais são os pontos principais?",
    "Quando essa informação é útil?",
    "Há algo mais que o agente deve saber sobre isso?",
  ],
};

const contentTypeLabels: Record<string, string> = {
  product: "Produto/Serviço",
  faq: "Pergunta Frequente",
  policy: "Política",
  instruction: "Instrução",
  general: "Conhecimento Geral",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { action, contentType, initialDescription, answers } = await req.json();

    if (action === 'get_questions') {
      // Return pre-defined questions for the content type
      const questions = questionTemplates[contentType] || questionTemplates.general;
      return new Response(
        JSON.stringify({ 
          success: true, 
          questions,
          typeLabel: contentTypeLabels[contentType] || contentTypeLabels.general,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'generate_content') {
      // Generate optimized content based on answers
      const questions = questionTemplates[contentType] || questionTemplates.general;
      const typeLabel = contentTypeLabels[contentType] || contentTypeLabels.general;

      // Build Q&A context
      const qaContext = questions
        .map((q, i) => `**${q}**\n${answers[i] || 'Não informado'}`)
        .join('\n\n');

      const systemPrompt = `Você é um especialista em criar conteúdo otimizado para bases de conhecimento de IA (RAG).
Seu objetivo é gerar um texto claro, objetivo e completo que um agente de IA possa usar para responder perguntas dos clientes.

Regras importantes:
1. O texto deve ser em primeira pessoa da empresa (nós, nossa empresa, etc.)
2. Use linguagem clara e direta
3. Inclua todos os detalhes relevantes fornecidos
4. Organize a informação de forma lógica
5. Não invente informações - use apenas o que foi fornecido
6. Se alguma informação não foi fornecida, não mencione
7. O texto deve ser autocontido e fazer sentido sozinho`;

      const userPrompt = `Crie um texto de conhecimento do tipo "${typeLabel}" para a base de conhecimento de um agente de IA.

**Descrição inicial do usuário:**
${initialDescription || 'Não fornecida'}

**Respostas às perguntas guiadas:**
${qaContext}

Gere um texto completo e bem formatado que o agente possa usar para responder perguntas relacionadas a este ${typeLabel.toLowerCase()}.
O texto deve incluir um título sugerido no início, seguido do conteúdo principal.

Formato esperado:
**Título:** [título sugerido]
**Conteúdo:**
[conteúdo principal otimizado]`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Créditos de IA insuficientes. Adicione créditos na sua conta.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const errorText = await response.text();
        console.error('AI gateway error:', response.status, errorText);
        throw new Error('Erro ao gerar conteúdo com IA');
      }

      const data = await response.json();
      const generatedText = data.choices?.[0]?.message?.content || '';

      // Parse title and content from generated text
      let title = '';
      let content = generatedText;

      const titleMatch = generatedText.match(/\*\*Título:\*\*\s*(.+?)(?:\n|$)/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      const contentMatch = generatedText.match(/\*\*Conteúdo:\*\*\s*([\s\S]+)/);
      if (contentMatch) {
        content = contentMatch[1].trim();
      } else {
        // If no explicit content section, use everything after title
        content = generatedText.replace(/\*\*Título:\*\*\s*.+?\n/, '').trim();
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          title,
          content,
          fullText: generatedText,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('enhance-knowledge error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
