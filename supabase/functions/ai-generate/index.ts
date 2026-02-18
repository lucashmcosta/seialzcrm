import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AIRequest {
  action: "summarize_contact" | "suggest_reply" | "analyze_opportunity" | "generate_email" | "improve_text" | "generate_agent_prompt" | "refine_agent_prompt" | "custom";
  prompt?: string;
  context?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create supabase client with user's auth
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user and organization
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's organization
    const { data: userOrg, error: orgError } = await supabase
      .from("users")
      .select("id, user_organizations!inner(organization_id)")
      .eq("auth_user_id", user.id)
      .eq("user_organizations.is_active", true)
      .single();

    if (orgError || !userOrg) {
      return new Response(
        JSON.stringify({ error: "User organization not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const organizationId = userOrg.user_organizations[0].organization_id;
    const userId = userOrg.id;

    // Find active AI integration (Claude or OpenAI)
    const { data: aiIntegrations, error: intError } = await supabase
      .from("organization_integrations")
      .select("*, integration:admin_integrations!inner(*)")
      .eq("organization_id", organizationId)
      .eq("is_enabled", true)
      .in("integration.slug", ["claude-ai", "openai-gpt"]);

    if (intError || !aiIntegrations || aiIntegrations.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma integração de IA configurada. Conecte o Claude ou ChatGPT em Configurações > Integrações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prefer Claude if both are configured
    const aiIntegration = aiIntegrations.find(i => i.integration.slug === "claude-ai") || aiIntegrations[0];
    const integrationSlug = aiIntegration.integration.slug;
    const configValues = aiIntegration.config_values as Record<string, any>;

    if (!configValues?.api_key) {
      return new Response(
        JSON.stringify({ error: "API key não configurada para a integração de IA." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, prompt, context }: AIRequest = await req.json();

    // Build system prompt based on action
    let systemPrompt = "Você é um assistente de CRM inteligente. Responda de forma clara, profissional e concisa em português.";
    let userPrompt = prompt || "";

    switch (action) {
      case "summarize_contact":
        systemPrompt = "Você é um assistente de vendas. Analise o histórico do contato e gere um resumo executivo focado em oportunidades de negócio.";
        userPrompt = `Resuma as informações deste contato:\n${JSON.stringify(context, null, 2)}`;
        break;
      case "suggest_reply":
        systemPrompt = "Você é um especialista em comunicação de vendas. Sugira uma resposta profissional e persuasiva.";
        userPrompt = `Sugira uma resposta para esta mensagem do cliente:\n${context?.message}\n\nContexto do cliente:\n${JSON.stringify(context?.contactInfo, null, 2)}`;
        break;
      case "analyze_opportunity":
        systemPrompt = "Você é um consultor de vendas. Analise a oportunidade e forneça insights sobre probabilidade de fechamento e próximos passos recomendados.";
        userPrompt = `Analise esta oportunidade de negócio:\n${JSON.stringify(context, null, 2)}`;
        break;
      case "generate_email":
        systemPrompt = "Você é um especialista em copywriting de emails comerciais. Gere um email profissional e persuasivo.";
        userPrompt = `Gere um email com base nas seguintes instruções:\n${prompt}\n\nContexto:\n${JSON.stringify(context, null, 2)}`;
        break;
      case "improve_text":
        systemPrompt = "Você é um especialista em redação. Melhore o texto mantendo a mensagem original. Retorne APENAS o texto melhorado, sem explicações ou comentários adicionais.";
        if (context?.mode === 'grammar') {
          userPrompt = `Corrija apenas erros de gramática e ortografia neste texto, mantendo o tom original. Retorne apenas o texto corrigido:\n\n${context?.text}`;
        } else if (context?.mode === 'professional') {
          userPrompt = `Reescreva este texto de forma mais profissional e formal, mantendo a mensagem. Retorne apenas o texto reescrito:\n\n${context?.text}`;
        } else if (context?.mode === 'friendly') {
          userPrompt = `Reescreva este texto de forma mais amigável e simpática, mantendo a mensagem. Retorne apenas o texto reescrito:\n\n${context?.text}`;
        } else if (context?.mode === 'persuasive') {
          userPrompt = `Reescreva este texto de forma mais persuasiva, usando técnicas de copywriting para engajar e converter o prospect. Mantenha a mensagem principal. Retorne apenas o texto reescrito:\n\n${context?.text}`;
        }
        break;
      case "generate_agent_prompt":
        systemPrompt = `Você é um especialista em criar prompts para agentes de IA de vendas (SDR - Sales Development Representative).
Com base nas informações fornecidas sobre a empresa, crie um prompt detalhado e bem estruturado em formato Markdown.

O prompt deve incluir as seguintes seções:
## Identidade
- Quem é o agente, qual empresa representa

## Tom de Comunicação
- Como o agente deve se comunicar (formal, amigável, técnico)

## Produtos/Serviços
- Lista detalhada dos produtos/serviços oferecidos

## Diferenciais
- O que destacar sobre a empresa/produtos

## Objetivo Principal
- Qual é a meta do agente nas conversas

## Regras Importantes
- O que o agente DEVE fazer (com ✅)
- O que o agente NÃO DEVE fazer (com ❌)

Use uma linguagem clara e direta. O prompt deve ser prático e acionável para o agente de IA.`;

        userPrompt = `Crie o prompt do agente SDR com base nestas informações:

EMPRESA:
- Nome: ${context?.companyName}
- Segmento: ${context?.companySegment}
- Descrição: ${context?.companyDescription}

PRODUTOS/SERVIÇOS:
${context?.products}

DIFERENCIAIS:
${context?.differentials || 'Não informado'}

OBJETIVO DO AGENTE: ${context?.goal}
TOM DE COMUNICAÇÃO: ${context?.tone}

ARGUMENTOS DE VENDA (PITCH):
${context?.salesPitch || 'Não informado'}

RESTRIÇÕES (O que o agente NÃO deve fazer):
${context?.restrictions || 'Não informado'}`;
        break;
      case "refine_agent_prompt":
        systemPrompt = `Você é um especialista em otimizar prompts de agentes de IA de vendas (SDR).

Sua tarefa é incorporar o feedback fornecido ao prompt existente, refinando-o sem perder as informações originais.

Regras IMPORTANTES:
- Mantenha a estrutura em Markdown existente
- Incorpore o feedback de forma natural no prompt
- NÃO remova informações existentes, apenas adicione ou ajuste conforme o feedback
- Mantenha o mesmo tom e formato do prompt original
- Se o feedback pedir para mudar comportamento, adicione/modifique nas seções relevantes
- Se o feedback pedir para adicionar informações, inclua na seção mais apropriada
- Retorne o prompt COMPLETO atualizado, não apenas as mudanças`;

        userPrompt = `PROMPT ATUAL DO AGENTE:
${context?.currentPrompt}

---

FEEDBACK A INCORPORAR:
${context?.feedback}

---

Por favor, gere o prompt completo atualizado incorporando o feedback acima de forma natural.`;
        break;
      case "custom":
      default:
    }

    let response: any;
    let tokensUsed = { prompt: 0, completion: 0, total: 0 };
    let modelUsed = "";

    if (integrationSlug === "claude-ai" && configValues?.api_key) {
      // Call Claude API
      const model = configValues.default_model || "claude-3-5-sonnet-20241022";
      const maxTokens = configValues.max_tokens || 1024;
      modelUsed = model;

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": configValues.api_key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error("Claude API error:", claudeResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `Erro na API do Claude: ${claudeResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const claudeData = await claudeResponse.json();
      response = {
        content: claudeData.content?.[0]?.text || "",
        model: claudeData.model,
      };
      tokensUsed = {
        prompt: claudeData.usage?.input_tokens || 0,
        completion: claudeData.usage?.output_tokens || 0,
        total: (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0),
      };

    } else if (integrationSlug === "openai-gpt") {
      // Call OpenAI API
      const model = configValues.default_model || "gpt-4o-mini";
      const maxTokens = configValues.max_tokens || 1024;
      modelUsed = model;

      const openaiHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${configValues.api_key}`,
      };

      if (configValues.organization_id) {
        openaiHeaders["OpenAI-Organization"] = configValues.organization_id;
      }

      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: openaiHeaders,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error("OpenAI API error:", openaiResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `Erro na API do OpenAI: ${openaiResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const openaiData = await openaiResponse.json();
      response = {
        content: openaiData.choices?.[0]?.message?.content || "",
        model: openaiData.model,
      };
      tokensUsed = {
        prompt: openaiData.usage?.prompt_tokens || 0,
        completion: openaiData.usage?.completion_tokens || 0,
        total: openaiData.usage?.total_tokens || 0,
      };
    }

    // Log usage
    await supabase.from("ai_usage_logs").insert({
      organization_id: organizationId,
      user_id: userId,
      integration_slug: integrationSlug,
      model_used: modelUsed,
      action,
      prompt_tokens: tokensUsed.prompt,
      completion_tokens: tokensUsed.completion,
      total_tokens: tokensUsed.total,
      entity_type: context?.entity_type,
      entity_id: context?.entity_id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        content: response.content,
        model: response.model,
        tokens: tokensUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI generate error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
