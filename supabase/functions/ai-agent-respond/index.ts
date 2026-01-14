import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentRequest {
  agentId: string;
  contactId: string;
  threadId: string;
  message: string;
  isTestMode?: boolean;
}

interface WorkingHours {
  enabled: boolean;
  timezone: string;
  schedule: {
    [day: string]: { start: string; end: string } | null;
  };
}

/**
 * Check if current time is within working hours
 */
function isWithinWorkingHours(workingHours: WorkingHours): boolean {
  if (!workingHours.enabled) return true;

  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: workingHours.timezone || 'America/Sao_Paulo',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  
  const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  const currentTime = `${hour}:${minute}`;

  const daySchedule = workingHours.schedule[weekday];
  if (!daySchedule) return false;

  return currentTime >= daySchedule.start && currentTime <= daySchedule.end;
}

/**
 * Build system prompt based on agent configuration
 */
function buildSystemPrompt(
  agent: any,
  contact: any,
  company: any,
  opportunities: any[],
  messageHistory: any[]
): string {
  const toneDescriptions: Record<string, string> = {
    professional: 'Seja profissional, cortês e objetivo. Use linguagem formal mas acolhedora.',
    friendly: 'Seja amigável, simpático e use linguagem casual. Pode usar emojis com moderação.',
    formal: 'Seja extremamente formal e corporativo. Use linguagem técnica e respeitosa.',
    casual: 'Seja descontraído e informal. Use emojis e linguagem do dia-a-dia.',
    technical: 'Seja técnico e direto. Foque em informações precisas e objetivas.',
  };

  const goalDescriptions: Record<string, string> = {
    qualify_lead: 'Seu objetivo é qualificar o lead fazendo perguntas estratégicas para entender suas necessidades, orçamento, timing e autoridade de decisão.',
    schedule_meeting: 'Seu objetivo principal é agendar uma reunião ou demonstração. Direcione a conversa para marcar um horário.',
    answer_questions: 'Responda dúvidas sobre produtos e serviços de forma clara e completa.',
    support: 'Forneça suporte ao cliente, ajude a resolver problemas e escale quando necessário.',
    custom: 'Siga as instruções personalizadas fornecidas.',
  };

  let prompt = `Você é ${agent.name}, um assistente virtual de vendas (SDR).

## TOM DA CONVERSA
${toneDescriptions[agent.tone] || toneDescriptions.professional}

## OBJETIVO PRINCIPAL
${goalDescriptions[agent.goal] || goalDescriptions.qualify_lead}
`;

  if (agent.custom_instructions) {
    prompt += `
## INSTRUÇÕES PERSONALIZADAS
${agent.custom_instructions}
`;
  }

  // Add contact context
  prompt += `
## CONTEXTO DO CONTATO
`;
  if (contact) {
    prompt += `- Nome: ${contact.full_name || 'Não informado'}
- Email: ${contact.email || 'Não informado'}
- Telefone: ${contact.phone || 'Não informado'}
- Estágio: ${contact.lifecycle_stage || 'lead'}
- Origem: ${contact.source || 'WhatsApp'}
`;
  }

  // Add company context
  if (company) {
    prompt += `
## EMPRESA DO CONTATO
- Nome: ${company.name}
- Domínio: ${company.domain || 'Não informado'}
`;
  }

  // Add opportunities context
  if (opportunities && opportunities.length > 0) {
    prompt += `
## OPORTUNIDADES EM ABERTO
`;
    opportunities.forEach((opp, i) => {
      prompt += `${i + 1}. ${opp.title} - R$ ${opp.amount?.toLocaleString('pt-BR') || '0'} (${opp.stage_name || 'Em andamento'})
`;
    });
  }

  // Add message history context
  if (messageHistory && messageHistory.length > 0) {
    prompt += `
## HISTÓRICO RECENTE DA CONVERSA (últimas ${messageHistory.length} mensagens)
`;
    messageHistory.forEach(msg => {
      const sender = msg.direction === 'inbound' ? 'Cliente' : 'Você';
      prompt += `${sender}: ${msg.content?.slice(0, 200)}${msg.content?.length > 200 ? '...' : ''}
`;
    });
  }

  prompt += `
## REGRAS IMPORTANTES
1. Responda APENAS com a mensagem para o cliente, sem explicações ou meta-comentários
2. Mantenha respostas concisas (máximo 3 parágrafos curtos)
3. Seja natural e humano na comunicação
4. Nunca invente informações sobre produtos ou preços
5. Se não souber algo, ofereça conectar com um especialista
`;

  return prompt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { agentId, contactId, threadId, message, isTestMode }: AgentRequest = await req.json();

    console.log(`AI Agent processing - Agent: ${agentId}, Contact: ${contactId}, Thread: ${threadId}, TestMode: ${isTestMode}`);

    // 1. Fetch agent configuration
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      console.error('Agent not found:', agentError);
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = agent.organization_id;

    // 2. Check working hours
    const workingHours = agent.working_hours as WorkingHours;
    if (!isWithinWorkingHours(workingHours)) {
      console.log('Outside working hours, sending out-of-hours message');
      
      // Log as skipped
      await supabase.from('ai_agent_logs').insert({
        organization_id: organizationId,
        agent_id: agentId,
        contact_id: contactId,
        thread_id: threadId,
        input_message: message,
        output_message: agent.out_of_hours_message || '',
        status: 'skipped_out_of_hours',
        response_time_ms: Date.now() - startTime,
      });

      // Send out of hours message
      if (agent.out_of_hours_message) {
        await supabase.functions.invoke('twilio-whatsapp-send', {
          body: {
            threadId,
            content: agent.out_of_hours_message,
            isAgentMessage: true,
          }
        });
      }

      return new Response(
        JSON.stringify({ success: true, status: 'out_of_hours' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check message limit per conversation
    const { count: messageCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', threadId)
      .eq('direction', 'outbound')
      .not('sender_user_id', 'is', null);

    // Count agent-sent messages (we'll track this differently)
    const { count: agentMessageCount } = await supabase
      .from('ai_agent_logs')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', threadId)
      .eq('status', 'success');

    if (agentMessageCount && agentMessageCount >= agent.max_messages_per_conversation) {
      console.log(`Max messages reached: ${agentMessageCount}/${agent.max_messages_per_conversation}`);
      
      await supabase.from('ai_agent_logs').insert({
        organization_id: organizationId,
        agent_id: agentId,
        contact_id: contactId,
        thread_id: threadId,
        input_message: message,
        output_message: '',
        status: 'skipped_max_messages',
        response_time_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ success: true, status: 'max_messages_reached' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Collect CRM context
    const [contactResult, companyResult, opportunitiesResult, historyResult] = await Promise.all([
      // Contact
      supabase
        .from('contacts')
        .select('id, full_name, email, phone, company_name, lifecycle_stage, source, company_id')
        .eq('id', contactId)
        .single(),
      
      // Company (if contact has one)
      supabase
        .from('contacts')
        .select('company:companies(id, name, domain, phone, address)')
        .eq('id', contactId)
        .single(),
      
      // Opportunities
      supabase
        .from('opportunities')
        .select('id, title, amount, status, pipeline_stage:pipeline_stages(name)')
        .eq('contact_id', contactId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .limit(5),
      
      // Message history
      supabase
        .from('messages')
        .select('content, direction, created_at')
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const contact = contactResult.data;
    const company = companyResult.data?.company as any;
    const opportunities = (opportunitiesResult.data || []).map((opp: any) => ({
      ...opp,
      stage_name: opp.pipeline_stage?.name,
    }));
    const messageHistory = (historyResult.data || []).reverse();

    // 5. Find AI integration
    const { data: aiIntegrations } = await supabase
      .from('organization_integrations')
      .select('*, integration:admin_integrations!inner(*)')
      .eq('organization_id', organizationId)
      .eq('is_enabled', true)
      .in('integration.slug', ['claude-ai', 'openai-gpt']);

    if (!aiIntegrations || aiIntegrations.length === 0) {
      console.error('No AI integration configured');
      await supabase.from('ai_agent_logs').insert({
        organization_id: organizationId,
        agent_id: agentId,
        contact_id: contactId,
        thread_id: threadId,
        input_message: message,
        output_message: '',
        status: 'error',
        error_message: 'No AI integration configured',
        response_time_ms: Date.now() - startTime,
      });
      return new Response(
        JSON.stringify({ error: 'No AI integration configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prefer Claude
    const aiIntegration = aiIntegrations.find(i => i.integration.slug === 'claude-ai') || aiIntegrations[0];
    const integrationSlug = aiIntegration.integration.slug;
    const configValues = aiIntegration.config_values as Record<string, any>;

    if (!configValues?.api_key) {
      console.error('API key not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Build prompt and call AI
    const systemPrompt = buildSystemPrompt(agent, contact, company, opportunities, messageHistory);
    const userPrompt = message;

    let aiResponse: string = '';
    let tokensUsed = 0;
    let modelUsed = '';

    if (integrationSlug === 'claude-ai') {
      const model = configValues.default_model || 'claude-sonnet-4-20250514';
      const maxTokens = 512;
      modelUsed = model;

      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': configValues.api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error('Claude API error:', claudeResponse.status, errorText);
        throw new Error(`Claude API error: ${claudeResponse.status}`);
      }

      const claudeData = await claudeResponse.json();
      aiResponse = claudeData.content?.[0]?.text || '';
      tokensUsed = (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0);

    } else if (integrationSlug === 'openai-gpt') {
      const model = configValues.default_model || 'gpt-4o-mini';
      const maxTokens = 512;
      modelUsed = model;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${configValues.api_key}`,
      };

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error('OpenAI API error:', openaiResponse.status, errorText);
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const openaiData = await openaiResponse.json();
      aiResponse = openaiData.choices?.[0]?.message?.content || '';
      tokensUsed = openaiData.usage?.total_tokens || 0;
    }

    if (!aiResponse) {
      throw new Error('Empty AI response');
    }

    const responseTime = Date.now() - startTime;

    // 7. Check if this is test mode - don't send to WhatsApp, just return response
    if (isTestMode) {
      console.log(`AI Agent TEST MODE response - ${responseTime}ms, ${tokensUsed} tokens`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          response: aiResponse,
          responseTime,
          tokensUsed,
          isTestMode: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Send response via WhatsApp (production mode)
    const { error: sendError } = await supabase.functions.invoke('twilio-whatsapp-send', {
      body: {
        organizationId,
        contactId,
        threadId,
        message: aiResponse,
        isAgentMessage: true,
        agentId: agent.id,
        senderName: agent.name,
      }
    });

    if (sendError) {
      console.error('Error sending WhatsApp message:', sendError);
      throw new Error('Failed to send WhatsApp message');
    }

    // 9. Log successful interaction
    await supabase.from('ai_agent_logs').insert({
      organization_id: organizationId,
      agent_id: agentId,
      contact_id: contactId,
      thread_id: threadId,
      input_message: message,
      output_message: aiResponse,
      context_used: {
        contact: contact ? { name: contact.full_name, stage: contact.lifecycle_stage } : null,
        company: company ? { name: company.name } : null,
        opportunities_count: opportunities.length,
        history_count: messageHistory.length,
      },
      response_time_ms: responseTime,
      tokens_used: tokensUsed,
      model_used: modelUsed,
      status: 'success',
    });

    // 10. Log to ai_usage_logs for billing/analytics
    await supabase.from('ai_usage_logs').insert({
      organization_id: organizationId,
      integration_slug: integrationSlug,
      model_used: modelUsed,
      action: 'ai_agent_respond',
      total_tokens: tokensUsed,
      entity_type: 'message',
      entity_id: threadId,
    });

    console.log(`AI Agent response sent - ${responseTime}ms, ${tokensUsed} tokens`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: aiResponse,
        responseTime,
        tokensUsed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI Agent error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
