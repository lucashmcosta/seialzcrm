import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[CRON] Iniciando busca de mensagens agendadas...');

    // Buscar mensagens pendentes que já passaram do horário agendado
    const { data: pendingMessages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select(`
        *,
        contact:contacts(id, phone, full_name),
        thread:message_threads(id, channel),
        agent:ai_agents(id, name)
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .lt('retry_count', 3)
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('[CRON] Erro ao buscar mensagens:', fetchError);
      throw fetchError;
    }

    console.log(`[CRON] Encontradas ${pendingMessages?.length || 0} mensagens para enviar`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Processar cada mensagem
    for (const message of pendingMessages || []) {
      results.processed++;
      
      try {
        console.log(`[CRON] Processando mensagem ${message.id} para contato ${message.contact?.full_name}`);

        // Verificar se tem telefone
        if (!message.contact?.phone) {
          throw new Error('Contato sem telefone');
        }

        // Buscar integração WhatsApp da organização
        const { data: whatsappIntegration } = await supabase
          .from('integrations')
          .select('config')
          .eq('organization_id', message.organization_id)
          .eq('provider', 'twilio_whatsapp')
          .eq('status', 'active')
          .single();

        if (!whatsappIntegration) {
          throw new Error('Integração WhatsApp não configurada');
        }

        // Enviar mensagem via edge function twilio-whatsapp-send
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/twilio-whatsapp-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            organizationId: message.organization_id,
            contactId: message.contact_id,
            threadId: message.thread_id,
            content: message.content,
            senderType: 'agent',
            senderAgentId: message.ai_agent_id,
          }),
        });

        const sendResult = await sendResponse.json();

        if (!sendResponse.ok || sendResult.error) {
          throw new Error(sendResult.error || 'Falha ao enviar mensagem');
        }

        // Atualizar mensagem como enviada
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', message.id);

        console.log(`[CRON] Mensagem ${message.id} enviada com sucesso`);
        results.sent++;

      } catch (msgError: any) {
        console.error(`[CRON] Erro ao processar mensagem ${message.id}:`, msgError);
        
        const newRetryCount = (message.retry_count || 0) + 1;
        const newStatus = newRetryCount >= 3 ? 'failed' : 'pending';

        await supabase
          .from('scheduled_messages')
          .update({
            status: newStatus,
            retry_count: newRetryCount,
            error_message: msgError.message || 'Erro desconhecido',
          })
          .eq('id', message.id);

        results.failed++;
        results.errors.push(`${message.id}: ${msgError.message}`);
      }
    }

    // Também verificar contact_memories com next_action_date = hoje
    // e criar notificações ou follow-ups automáticos
    const today = new Date().toISOString().split('T')[0];
    
    const { data: memoriesWithActions } = await supabase
      .from('contact_memories')
      .select(`
        *,
        contact:contacts(id, full_name, owner_user_id, organization_id)
      `)
      .eq('next_action_date', today);

    if (memoriesWithActions && memoriesWithActions.length > 0) {
      console.log(`[CRON] Encontradas ${memoriesWithActions.length} memórias com ações para hoje`);
      
      for (const memory of memoriesWithActions) {
        if (memory.next_action && memory.contact?.owner_user_id) {
          // Criar notificação para o usuário responsável
          await supabase
            .from('notifications')
            .insert({
              user_id: memory.contact.owner_user_id,
              organization_id: memory.contact.organization_id,
              type: 'reminder',
              title: 'Lembrete de follow-up',
              body: `${memory.contact.full_name}: ${memory.next_action}`,
              entity_type: 'contact',
              entity_id: memory.contact_id,
            });
          
          console.log(`[CRON] Notificação criada para contato ${memory.contact.full_name}`);
        }
      }
    }

    console.log('[CRON] Execução finalizada:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[CRON] Erro geral:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
