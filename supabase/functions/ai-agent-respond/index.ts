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

interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

// Available tools for the agent
const AVAILABLE_TOOLS = [
  {
    type: "function",
    function: {
      name: "update_contact",
      description: `Atualiza informações do contato no CRM.

📌 CONTEXTO IMPORTANTE:
O nome atual no sistema veio do perfil do WhatsApp e provavelmente NÃO é o nome real do cliente.
Exemplos comuns: "g.s." (real: Gianluca Silveira), "Mãe do Pedro" (real: Maria Santos)

⚠️ REGRAS PARA NOME:
1. Use APENAS quando o cliente CONFIRMAR o nome real
2. O fluxo correto é:
   - Agente pergunta: "Posso confirmar seu nome completo para nosso cadastro?"
   - Cliente responde: "Gianluca Silveira" ou "Meu nome é Maria"
   - Agente confirma: "Perfeito, Gianluca!" e usa a tool
3. Marque name_was_confirmed: true ao usar

Para email, telefone e empresa: pode atualizar diretamente quando informado.`,
      parameters: {
        type: "object",
        properties: {
          full_name: { 
            type: "string", 
            description: "Nome completo REAL do contato (não o nome do WhatsApp)" 
          },
          first_name: { type: "string", description: "Primeiro nome real do contato" },
          last_name: { type: "string", description: "Sobrenome do contato" },
          email: { type: "string", description: "Email do contato" },
          phone: { type: "string", description: "Telefone do contato" },
          company_name: { type: "string", description: "Nome da empresa do contato" },
          name_was_confirmed: {
            type: "boolean",
            description: "OBRIGATÓRIO para nome. True = cliente informou/confirmou o nome real."
          }
        },
      },
    },
  },
  {
    type: "function", 
    function: {
      name: "mark_name_asked",
      description: `Marca que você já perguntou o nome do cliente nesta conversa.
    
USE ESTA TOOL IMEDIATAMENTE após perguntar o nome para evitar perguntar novamente.
Exemplo de uso: Após enviar "Posso confirmar seu nome completo?", chame esta tool.`,
      parameters: {
        type: "object",
        properties: {
          question_asked: { 
            type: "string", 
            description: "A pergunta que você fez (ex: 'Perguntei nome completo para cadastro')" 
          }
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_opportunity",
      description: "Cria uma oportunidade de venda quando o cliente demonstra interesse em comprar. Use quando identificar intenção de compra clara.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da oportunidade (ex: 'Interesse em Plano Pro')" },
          amount: { type: "number", description: "Valor estimado da venda" },
          notes: { type: "string", description: "Notas sobre o interesse do cliente" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Cria uma tarefa de follow-up para a equipe. Use quando precisar agendar um retorno ou ação futura.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da tarefa (ex: 'Ligar para confirmar reunião')" },
          due_date: { type: "string", description: "Data de vencimento no formato YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade da tarefa" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transfer_to_human",
      description: "Transfere a conversa para um atendente humano. Use quando o cliente pedir explicitamente, o assunto for muito complexo, ou houver reclamação séria.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Motivo da transferência para o atendente" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_meeting",
      description: "Agenda uma reunião ou demonstração com o cliente.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da reunião" },
          date: { type: "string", description: "Data da reunião no formato YYYY-MM-DD" },
          time: { type: "string", description: "Horário da reunião no formato HH:MM" },
          notes: { type: "string", description: "Notas sobre a reunião" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Salva informações importantes sobre o contato para lembrar em conversas futuras. Use SEMPRE que o cliente mencionar: datas importantes (dia de pagamento, aniversário), contexto pessoal (família, trabalho), objeções, preferências, próximos passos combinados.",
      parameters: {
        type: "object",
        properties: {
          fact: { 
            type: "string", 
            description: "Fato importante para lembrar (ex: 'Recebe salário dia 15', 'Esposa se chama Maria', 'Trabalha como gerente de vendas')" 
          },
          next_action: { 
            type: "string", 
            description: "Próxima ação a fazer (ex: 'Retomar contato sobre pagamento')" 
          },
          next_action_date: { 
            type: "string", 
            description: "Data da próxima ação no formato YYYY-MM-DD" 
          },
          objection: { 
            type: "string", 
            description: "Objeção levantada pelo cliente (ex: 'Preço alto', 'Precisa pensar', 'Consultar sócio')" 
          },
          qualification: {
            type: "object",
            description: "Dados de qualificação do lead",
            properties: {
              interest_level: { type: "string", enum: ["low", "medium", "high"], description: "Nível de interesse demonstrado" },
              has_budget: { type: "boolean", description: "Se o cliente tem orçamento" },
              timeline: { type: "string", description: "Prazo para decisão (ex: 'Q1 2025', 'Próximo mês')" },
              decision_maker: { type: "boolean", description: "Se o contato é o decisor" }
            }
          }
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_follow_up",
      description: "Agenda uma mensagem de follow-up para ser enviada automaticamente no futuro. Use quando combinar de retornar contato em uma data específica (ex: 'dia 15', 'próxima semana').",
      parameters: {
        type: "object",
        properties: {
          message: { 
            type: "string", 
            description: "Mensagem que será enviada automaticamente (ex: 'Oi! Lembrei que hoje é dia 15 e combinamos de conversar sobre o plano.')" 
          },
          scheduled_date: { 
            type: "string", 
            description: "Data para enviar no formato YYYY-MM-DD" 
          },
          scheduled_time: { 
            type: "string", 
            description: "Horário para enviar no formato HH:MM (default: 09:00)" 
          },
          reason: { 
            type: "string", 
            description: "Motivo do agendamento (ex: 'Cliente recebe dia 15')" 
          },
        },
        required: ["message", "scheduled_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_payment_link",
      description: "Gera e envia um link de pagamento para o cliente. Use quando o cliente confirmar que quer pagar ou pedir o link.",
      parameters: {
        type: "object",
        properties: {
          amount: { 
            type: "number", 
            description: "Valor do pagamento em reais" 
          },
          description: { 
            type: "string", 
            description: "Descrição do pagamento (ex: 'Plano Pro - Mensal')" 
          },
          installments: { 
            type: "number", 
            description: "Número de parcelas (default: 1)" 
          },
        },
        required: ["amount", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_qualification",
      description: "Atualiza a qualificação do lead de forma estruturada. Use quando descobrir informações sobre interesse, orçamento, timing ou autoridade do lead.",
      parameters: {
        type: "object",
        properties: {
          interest_level: { 
            type: "string", 
            enum: ["cold", "warm", "hot"],
            description: "Nível de interesse: cold (frio/curioso), warm (morno/considerando), hot (quente/pronto pra comprar)" 
          },
          has_budget: { 
            type: "boolean", 
            description: "O lead confirmou que tem orçamento?" 
          },
          budget_range: { 
            type: "string", 
            description: "Faixa de orçamento mencionada (ex: 'até R$ 5.000')" 
          },
          timeline: { 
            type: "string", 
            description: "Quando pretende tomar decisão (ex: 'Esta semana', 'Próximo mês')" 
          },
          is_decision_maker: { 
            type: "boolean", 
            description: "O contato é quem toma a decisão final?" 
          },
          decision_maker_name: { 
            type: "string", 
            description: "Nome do decisor, se não for o contato atual" 
          },
          pain_points: {
            type: "array",
            items: { type: "string" },
            description: "Dores/problemas que o lead mencionou" 
          },
          competitors_mentioned: {
            type: "array",
            items: { type: "string" },
            description: "Concorrentes que o lead mencionou usar ou considerar" 
          },
        },
      },
    },
  },
];

/**
 * Execute a tool call and return the result
 */
async function executeTool(
  supabase: any,
  toolName: string,
  args: any,
  context: { contactId: string; organizationId: string; threadId: string }
): Promise<ToolResult> {
  console.log(`Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case 'update_contact': {
        const updateData: Record<string, any> = {};
        
        // VALIDAÇÃO: Nome só pode ser alterado com confirmação
        if (args.full_name || args.first_name || args.last_name) {
          if (!args.name_was_confirmed) {
            return { 
              success: false, 
              message: 'ERRO: Para atualizar o nome, o cliente precisa ter confirmado. Use name_was_confirmed: true apenas quando o cliente informou o nome real.',
              data: { requires_confirmation: true }
            };
          }
          
          // Buscar dados atuais para salvar o nome original do WhatsApp
          const { data: currentContact } = await supabase
            .from('contacts')
            .select('full_name')
            .eq('id', context.contactId)
            .single();
          
          // Preparar dados do nome
          if (args.full_name) updateData.full_name = args.full_name;
          if (args.first_name) updateData.first_name = args.first_name;
          if (args.last_name) updateData.last_name = args.last_name;
          
          // Atualizar memórias: marcar como confirmado e salvar nome original do WhatsApp
          const memoryUpdate: Record<string, any> = {
            name_confirmed: true,
            name_confirmed_at: new Date().toISOString(),
            name_asked: true,
            updated_at: new Date().toISOString(),
          };
          
          // Salvar nome original do WhatsApp se ainda não tiver
          if (currentContact?.full_name) {
            const { data: existingMemory } = await supabase
              .from('contact_memories')
              .select('original_whatsapp_name')
              .eq('contact_id', context.contactId)
              .single();
            
            if (!existingMemory?.original_whatsapp_name) {
              memoryUpdate.original_whatsapp_name = currentContact.full_name;
            }
          }
          
          await supabase
            .from('contact_memories')
            .upsert({
              organization_id: context.organizationId,
              contact_id: context.contactId,
              ...memoryUpdate,
            }, {
              onConflict: 'contact_id',
            });
        }
        
        // Outros campos não precisam de confirmação
        if (args.email) updateData.email = args.email;
        if (args.phone) updateData.phone = args.phone;
        if (args.company_name) updateData.company_name = args.company_name;

        if (Object.keys(updateData).length === 0) {
          return { success: false, message: 'Nenhum campo para atualizar' };
        }

        const { error } = await supabase
          .from('contacts')
          .update(updateData)
          .eq('id', context.contactId);

        if (error) {
          console.error('Error updating contact:', error);
          return { success: false, message: error.message };
        }
        
        return { 
          success: true, 
          message: 'Contato atualizado com sucesso', 
          data: updateData 
        };
      }

      case 'mark_name_asked': {
        // Marcar que já perguntou o nome
        const { error } = await supabase
          .from('contact_memories')
          .upsert({
            organization_id: context.organizationId,
            contact_id: context.contactId,
            name_asked: true,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'contact_id',
          });

        if (error) {
          console.error('Error marking name asked:', error);
          return { success: false, message: error.message };
        }
        
        console.log('✅ Marked name as asked for contact:', context.contactId);
        return { success: true, message: 'Marcado que perguntou o nome' };
      }

      case 'create_opportunity': {
        // Get first pipeline stage
        const { data: stages } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('organization_id', context.organizationId)
          .order('order_index')
          .limit(1);

        const stageId = stages?.[0]?.id;
        if (!stageId) {
          return { success: false, message: 'Nenhum estágio de pipeline encontrado' };
        }

        const { error } = await supabase
          .from('opportunities')
          .insert({
            organization_id: context.organizationId,
            contact_id: context.contactId,
            title: args.title,
            amount: args.amount || 0,
            pipeline_stage_id: stageId,
            status: 'open',
          });

        if (error) {
          console.error('Error creating opportunity:', error);
          return { success: false, message: error.message };
        }
        return { success: true, message: 'Oportunidade criada com sucesso' };
      }

      case 'create_task': {
        const { error } = await supabase
          .from('tasks')
          .insert({
            organization_id: context.organizationId,
            contact_id: context.contactId,
            title: args.title,
            due_date: args.due_date || null,
            priority: args.priority || 'medium',
            status: 'pending',
          });

        if (error) {
          console.error('Error creating task:', error);
          return { success: false, message: error.message };
        }
        return { success: true, message: 'Tarefa criada com sucesso' };
      }

      case 'transfer_to_human': {
        const { error } = await supabase
          .from('message_threads')
          .update({ needs_human_attention: true })
          .eq('id', context.threadId);

        if (error) {
          console.error('Error transferring to human:', error);
          return { success: false, message: error.message };
        }
        return { success: true, message: 'Conversa marcada para atenção humana' };
      }

      case 'schedule_meeting': {
        // Create a task for the meeting
        const meetingDate = args.date + (args.time ? ` ${args.time}` : '');
        const { error } = await supabase
          .from('tasks')
          .insert({
            organization_id: context.organizationId,
            contact_id: context.contactId,
            title: `📅 ${args.title}`,
            due_date: args.date,
            priority: 'high',
            status: 'pending',
          });

        if (error) {
          console.error('Error scheduling meeting:', error);
          return { success: false, message: error.message };
        }
        return { success: true, message: `Reunião agendada para ${meetingDate}` };
      }

      case 'save_memory': {
        // Fetch or create contact memory
        let { data: memory } = await supabase
          .from('contact_memories')
          .select('*')
          .eq('contact_id', context.contactId)
          .single();

        if (!memory) {
          // Create new memory
          const { data: newMemory, error: createError } = await supabase
            .from('contact_memories')
            .insert({
              organization_id: context.organizationId,
              contact_id: context.contactId,
              facts: [],
              objections: [],
              qualification: {},
              preferences: {}
            })
            .select()
            .single();
          
          if (createError) {
            console.error('Error creating memory:', createError);
            return { success: false, message: createError.message };
          }
          memory = newMemory;
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        const savedInfo: string[] = [];

        // Add fact
        if (args.fact) {
          const facts = (memory.facts as string[]) || [];
          if (!facts.includes(args.fact)) {
            facts.push(args.fact);
            updates.facts = facts;
            savedInfo.push(`Fato: ${args.fact}`);
          }
        }

        // Update next action
        if (args.next_action) {
          updates.next_action = args.next_action;
          savedInfo.push(`Próxima ação: ${args.next_action}`);
        }
        if (args.next_action_date) {
          updates.next_action_date = args.next_action_date;
          savedInfo.push(`Data: ${args.next_action_date}`);
        }

        // Add objection
        if (args.objection) {
          const objections = (memory.objections as string[]) || [];
          if (!objections.includes(args.objection)) {
            objections.push(args.objection);
            updates.objections = objections;
            savedInfo.push(`Objeção: ${args.objection}`);
          }
        }

        // Update qualification (merge)
        if (args.qualification) {
          updates.qualification = { ...(memory.qualification as object || {}), ...args.qualification };
          savedInfo.push(`Qualificação atualizada`);
        }

        const { error: updateError } = await supabase
          .from('contact_memories')
          .update(updates)
          .eq('id', memory.id);

        if (updateError) {
          console.error('Error updating memory:', updateError);
          return { success: false, message: updateError.message };
        }

        return { success: true, message: `Memória salva: ${savedInfo.join(', ')}` };
      }

      case 'schedule_follow_up': {
        // Parse scheduled date and time
        const scheduledTime = args.scheduled_time || '09:00';
        const scheduledAt = new Date(`${args.scheduled_date}T${scheduledTime}:00`);
        
        if (isNaN(scheduledAt.getTime())) {
          return { success: false, message: 'Data/hora inválida' };
        }

        const { error } = await supabase
          .from('scheduled_messages')
          .insert({
            organization_id: context.organizationId,
            contact_id: context.contactId,
            thread_id: context.threadId,
            content: args.message,
            scheduled_at: scheduledAt.toISOString(),
            reason: args.reason || null,
            created_by: 'agent',
            status: 'pending',
          });

        if (error) {
          console.error('Error scheduling follow-up:', error);
          return { success: false, message: error.message };
        }

        return { 
          success: true, 
          message: `Follow-up agendado para ${args.scheduled_date} às ${scheduledTime}`,
          data: { scheduled_at: scheduledAt.toISOString() }
        };
      }

      case 'send_payment_link': {
        // Buscar configuração de pagamento da organização (se existir)
        const { data: orgIntegrations } = await supabase
          .from('integrations')
          .select('config, provider')
          .eq('organization_id', context.organizationId)
          .in('provider', ['stripe', 'mercado_pago', 'pagarme']);

        let paymentLink = '';
        const amount = args.amount;
        const description = args.description;
        const installments = args.installments || 1;

        // 1. Primeiro: tentar de integrações (Stripe, Mercado Pago)
        const paymentIntegration = orgIntegrations?.[0];
        if (paymentIntegration?.config?.payment_link_base_url) {
          const baseUrl = paymentIntegration.config.payment_link_base_url;
          paymentLink = `${baseUrl}?amount=${amount}&description=${encodeURIComponent(description)}&installments=${installments}`;
        } else {
          // 2. Fallback: buscar na Base de Conhecimento (RAG) via query em duas etapas
          // A sintaxe de JOIN com filtro (.eq('item.organization_id', ...)) não funciona corretamente
          
          // Passo 1: Buscar IDs dos knowledge_items da organização
          const { data: orgItems, error: itemsError } = await supabase
            .from('knowledge_items')
            .select('id')
            .eq('organization_id', context.organizationId)
            .eq('status', 'published');

          if (itemsError) {
            console.error('Error fetching knowledge items:', itemsError);
          }

          const itemIds = orgItems?.map((i: { id: string }) => i.id) || [];
          console.log(`Found ${itemIds.length} published knowledge items for org ${context.organizationId}`);
          
          if (itemIds.length > 0) {
            // Passo 2: Buscar chunks desses items
            const { data: knowledgeChunks, error: chunksError } = await supabase
              .from('knowledge_chunks')
              .select('content, item_id')
              .in('item_id', itemIds)
              .limit(100);

            if (chunksError) {
              console.error('Error fetching knowledge chunks:', chunksError);
            }

            console.log(`Found ${knowledgeChunks?.length || 0} knowledge chunks`);

            // Filtrar chunks que contêm palavras-chave de pagamento
            const paymentKeywords = ['link de pagamento', 'payment link', 'checkout', 'mpago', 'mercadopago', 'pagamento', 'pagar', 'buy.stripe', 'stripe.com'];
            
            // Busca inteligente: priorizar por relevância com a descrição do produto
            const descLower = description?.toLowerCase() || '';
            const descWords = descLower.split(/\s+/).filter((w: string) => w.length > 3);

            const rankedChunks = knowledgeChunks
              ?.map((chunk: { content?: string; item_id?: string }) => {
                const contentLower = chunk.content?.toLowerCase() || '';
                const hasPaymentKeyword = paymentKeywords.some(k => contentLower.includes(k));
                const hasUrl = /https?:\/\//.test(chunk.content || '');
                
                // Contar palavras da descrição que aparecem no chunk
                const matchCount = descWords.filter((w: string) => contentLower.includes(w)).length;
                
                return {
                  ...chunk,
                  hasPaymentKeyword,
                  hasUrl,
                  matchCount,
                  score: (hasPaymentKeyword ? 10 : 0) + (hasUrl ? 5 : 0) + matchCount
                };
              })
              .filter((c: any) => c.hasUrl)
              .sort((a: any, b: any) => b.score - a.score);

            const paymentChunk = rankedChunks?.[0];
            console.log(`Best matching chunk score: ${paymentChunk?.score || 0}, matches: ${paymentChunk?.matchCount || 0}`);

            if (paymentChunk?.content) {
              // Extrair URL do conteúdo (regex para https://...)
              const urlMatch = paymentChunk.content.match(/https?:\/\/[^\s\)\]\>\"\']+/);
              if (urlMatch) {
                paymentLink = urlMatch[0];
                console.log('Payment link found in RAG chunks:', paymentLink);
              }
            }
          } else {
            console.log('No knowledge items found for organization:', context.organizationId);
          }

          // 3. Se ainda não encontrou, usar fallback genérico
          if (!paymentLink) {
            paymentLink = `[Solicite configuração do link de pagamento - R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}]`;
            console.log('No payment link configured, using fallback');
          }
        }

        // Atualizar valor da oportunidade se existir
        const { data: threads } = await supabase
          .from('message_threads')
          .select('opportunity_id')
          .eq('id', context.threadId)
          .single();

        if (threads?.opportunity_id) {
          await supabase
            .from('opportunities')
            .update({ amount: amount })
            .eq('id', threads.opportunity_id);
        }

        return { 
          success: true, 
          message: `Link de pagamento gerado: R$ ${amount}`,
          data: { 
            link: paymentLink,
            amount,
            description,
            installments
          }
        };
      }

      case 'update_qualification': {
        // Buscar ou criar memória do contato
        let { data: memory } = await supabase
          .from('contact_memories')
          .select('*')
          .eq('contact_id', context.contactId)
          .single();

        if (!memory) {
          const { data: newMemory, error: createError } = await supabase
            .from('contact_memories')
            .insert({
              organization_id: context.organizationId,
              contact_id: context.contactId,
              qualification: {},
            })
            .select()
            .single();
          
          if (createError) {
            console.error('Error creating memory:', createError);
            return { success: false, message: createError.message };
          }
          memory = newMemory;
        }

        // Merge com qualificação existente
        const existingQualification = (memory.qualification as object) || {};
        const updatedQualification = {
          ...existingQualification,
          ...args,
          updated_at: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from('contact_memories')
          .update({ qualification: updatedQualification })
          .eq('id', memory.id);

        if (updateError) {
          console.error('Error updating qualification:', updateError);
          return { success: false, message: updateError.message };
        }

        // Atualizar lifecycle_stage do contato se for hot
        if (args.interest_level === 'hot') {
          await supabase
            .from('contacts')
            .update({ lifecycle_stage: 'opportunity' })
            .eq('id', context.contactId);
        }

        const qualDetails: string[] = [];
        if (args.interest_level) qualDetails.push(`Interesse: ${args.interest_level}`);
        if (args.has_budget !== undefined) qualDetails.push(`Orçamento: ${args.has_budget ? 'Sim' : 'Não'}`);
        if (args.timeline) qualDetails.push(`Timeline: ${args.timeline}`);
        if (args.is_decision_maker !== undefined) qualDetails.push(`Decisor: ${args.is_decision_maker ? 'Sim' : 'Não'}`);

        return { 
          success: true, 
          message: `Qualificação atualizada: ${qualDetails.join(', ') || 'dados salvos'}` 
        };
      }

      default:
        return { success: false, message: `Tool desconhecida: ${toolName}` };
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    return { success: false, message: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
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
 * Rerank results using Voyage AI rerank-2 model for semantic precision
 */
interface RerankResult {
  index: number;
  relevance_score: number;
}

async function rerankResults(
  query: string,
  documents: string[],
  topK: number = 5
): Promise<number[]> {
  const voyageApiKey = Deno.env.get("VOYAGE_API_KEY");
  
  if (!voyageApiKey || documents.length === 0) {
    console.log('⚠️ Rerank skipped: no API key or empty documents');
    return documents.map((_, i) => i).slice(0, topK);
  }
  
  // Skip reranking if we have fewer documents than requested
  if (documents.length <= topK) {
    console.log(`ℹ️ Skipping rerank: only ${documents.length} docs (need ${topK})`);
    return documents.map((_, i) => i);
  }
  
  try {
    console.log(`🔄 Reranking ${documents.length} documents via Voyage AI...`);
    
    const response = await fetch('https://api.voyageai.com/v1/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${voyageApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'rerank-2',
        query: query,
        documents: documents,
        top_k: topK,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Rerank API error:', errorText);
      return documents.map((_, i) => i).slice(0, topK);
    }
    
    const data = await response.json();
    const results: RerankResult[] = data.data || [];
    
    console.log(`✅ Rerank complete. Top ${Math.min(3, results.length)} relevance scores:`, 
      results.slice(0, 3).map(r => `[${r.index}]=${r.relevance_score.toFixed(3)}`).join(', '));
    
    return results.map(r => r.index);
  } catch (error) {
    console.error('❌ Rerank error:', error);
    return documents.map((_, i) => i).slice(0, topK);
  }
}

/**
 * Search for relevant knowledge using RAG with Voyage AI embeddings
 * Implements 2-STEP SEARCH: product-first + global fallback
 * Then RERANKS results for semantic precision
 */
async function searchRelevantKnowledge(
  supabase: any,
  messageContent: string,
  organizationId: string,
  agentId: string,
  productId: string | null = null,
  matchCount: number = 5  // Final count after reranking (was 10)
): Promise<{ content: string; title: string | null; type: string; scope: string; category: string }[]> {
  try {
    const voyageApiKey = Deno.env.get("VOYAGE_API_KEY");
    
    if (!voyageApiKey) {
      console.warn('⚠️ VOYAGE_API_KEY not configured - RAG disabled');
      return [];
    }

    // Reranking parameters: fetch MORE candidates, then filter to TOP
    const candidateCount = 30;  // Fetch more candidates for reranker
    const lowThreshold = 0.30;  // Lower threshold to maximize candidate pool

    console.log(`🔍 Generating query embedding via Voyage AI...`);

    // Generate embedding for the query via Voyage AI
    const embeddingResponse = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${voyageApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voyage-3', // MUST use voyage-3 for 1024 dimensions (matches DB schema)
        input: messageContent,
        input_type: 'query', // Optimized for search queries
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.warn('❌ Voyage AI embedding failed:', errorText);
      return [];
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data?.[0]?.embedding;

    if (!queryEmbedding) {
      console.warn('❌ No embedding returned from Voyage AI');
      return [];
    }

    // CRITICAL: Validate embedding dimensions match DB schema (vector(1024))
    if (queryEmbedding.length !== 1024) {
      console.error(`❌ Embedding dimension mismatch: got ${queryEmbedding.length}, expected 1024. Model may have returned wrong dimensions.`);
      return [];
    }

    console.log(`✅ Query embedding generated (${queryEmbedding.length} dimensions)`);

    let candidates: any[] = [];

    // STEP 1: Fetch broad candidate pool with LOW threshold
    if (!productId) {
      console.log(`🔍 No productId - searching ALL knowledge (threshold: ${lowThreshold}, limit: ${candidateCount})`);
      
      const { data: allResults, error: allError } = await supabase.rpc('search_knowledge_all', {
        query_embedding: queryEmbedding,
        org_id: organizationId,
        match_threshold: lowThreshold,
        match_count: candidateCount,
      });

      if (allError) {
        console.warn('❌ search_knowledge_all error:', allError.message);
      } else if (allResults?.length > 0) {
        console.log(`📊 Initial candidates: ${allResults.length} chunks across all scopes`);
        candidates = allResults;
      }
    } else {
      // Product-first search
      console.log(`🎯 Searching product-specific chunks (productId: ${productId}, threshold: ${lowThreshold})`);
      
      const { data: productResults, error: productError } = await supabase.rpc('search_knowledge_product', {
        query_embedding: queryEmbedding,
        org_id: organizationId,
        p_product_id: productId,
        p_categories: null,
        match_threshold: lowThreshold,
        match_count: candidateCount,
      });

      if (productError) {
        console.warn('❌ Product RAG search error:', productError.message);
      } else if (productResults?.length > 0) {
        console.log(`📊 Product candidates: ${productResults.length}`);
        candidates.push(...productResults);
      }

      // Complete with global chunks
      if (candidates.length < candidateCount) {
        const remaining = candidateCount - candidates.length;
        console.log(`🌐 Searching global chunks (need ${remaining} more)`);
        
        const { data: globalResults, error: globalError } = await supabase.rpc('search_knowledge_global', {
          query_embedding: queryEmbedding,
          org_id: organizationId,
          p_categories: null,
          match_threshold: lowThreshold,
          match_count: remaining,
        });

        if (globalError) {
          console.warn('❌ Global RAG search error:', globalError.message);
        } else if (globalResults?.length > 0) {
          console.log(`📊 Global candidates: ${globalResults.length}`);
          candidates.push(...globalResults);
        }
      }
    }

    // Fallback if no candidates found
    if (candidates.length === 0) {
      console.log('⚠️ No candidates found - trying fallback with lower threshold');
      const { data: fallbackResults, error: fallbackError } = await supabase.rpc('search_knowledge_all', {
        query_embedding: queryEmbedding,
        org_id: organizationId,
        match_threshold: 0.20, // Very low for last resort
        match_count: candidateCount,
      });

      if (!fallbackError && fallbackResults?.length > 0) {
        console.log(`📊 Fallback candidates: ${fallbackResults.length}`);
        candidates = fallbackResults;
      }
    }

    console.log(`📊 Total candidates before rerank: ${candidates.length}`);

    if (candidates.length === 0) {
      console.log('⚠️ No candidates found for reranking');
      return [];
    }

    // STEP 2: RERANK for semantic precision
    const documents = candidates.map(c => c.content);
    const rerankedIndices = await rerankResults(messageContent, documents, matchCount);

    // Build final results from reranked indices
    const results = rerankedIndices
      .map(idx => candidates[idx])
      .filter(Boolean)
      .map(r => ({
        content: r.content,
        title: r.title,
        type: 'knowledge',
        scope: r.scope || 'global',
        category: r.category || 'geral',
      }));

    console.log(`🎯 Final RAG results after rerank: ${results.length} high-relevance chunks`);

    return results;
  } catch (err) {
    console.warn('❌ RAG search failed:', err);
    return [];
  }
}

/**
 * Detecta se o nome parece ser um nome real ou um nome de perfil do WhatsApp
 * Retorna: 'real' | 'suspicious' | 'unknown'
 */
function analyzeNameQuality(name: string | null): 'real' | 'suspicious' | 'unknown' {
  if (!name || name.trim() === '') return 'unknown';
  
  const trimmed = name.trim();
  
  // Padrões suspeitos (provavelmente não é nome real)
  const suspiciousPatterns = [
    /^[a-z]\.[a-z]\.?$/i,           // "g.s.", "m.s."
    /^[a-z]{1,2}$/i,                // "gs", "ms" 
    /^.{1,3}$/,                      // Muito curto (1-3 chars)
    /[✨🌟💫⭐️🔥💖💕🦋🌸🌺🌷]/,    // Emojis decorativos
    /^(mãe|pai|tia|tio|vó|vô)\s/i, // "Mãe do Pedro"
    /^\+?\d{10,}/,                   // Número de telefone
    /^[^a-záàâãéèêíìîóòôõúùûç\s]+$/i, // Sem letras
    /^(admin|user|cliente|test)/i,   // Nomes genéricos
    /^[A-Z]\s+[A-Z]$/,              // "G S" - iniciais
    /\d{4,}/,                        // Contém números (ex: "Maria123")
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(trimmed)) {
      return 'suspicious';
    }
  }
  
  // Parece um nome real se:
  // - Tem pelo menos 2 palavras
  // - Primeira palavra tem 3+ letras
  // - Total de 5+ caracteres
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const firstWord = words[0] || '';
  
  if (words.length >= 2 && firstWord.length >= 3 && trimmed.length >= 8) {
    return 'real';
  }
  
  // Pode ser nome real incompleto (só primeiro nome com 4+ letras)
  if (words.length === 1 && firstWord.length >= 4 && /^[a-záàâãéèêíìîóòôõúùûç]+$/i.test(firstWord)) {
    return 'suspicious'; // Suspeito porque está incompleto
  }
  
  return 'unknown';
}

/**
 * Build system prompt based on agent configuration
 */
function buildSystemPrompt(
  agent: any,
  contact: any,
  company: any,
  opportunities: any[],
  enabledTools: string[],
  memories: any | null,
  retrievedKnowledge: { content: string; title: string | null; type: string }[] = []
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
    prompt += `- Nome atual registrado: ${contact.full_name || 'Não informado'}
- Email: ${contact.email || 'Não informado'}
- Telefone: ${contact.phone || 'Não informado'}
- Estágio: ${contact.lifecycle_stage || 'lead'}
- Origem: ${contact.source || 'WhatsApp'}
`;
  }

  // NAME CONFIRMATION LOGIC - Analisar qualidade do nome e gerar instruções dinâmicas
  const nameQuality = analyzeNameQuality(contact?.full_name);
  const nameConfirmed = memories?.name_confirmed === true;
  const nameAsked = memories?.name_asked === true;

  let nameInstruction = '';

  if (nameConfirmed) {
    // Nome já foi confirmado - não precisa perguntar
    nameInstruction = `
✅ NOME CONFIRMADO: "${contact?.full_name}"
   O cliente já confirmou este nome. Não pergunte novamente.
   Use o nome naturalmente na conversa.`;
   
  } else if (nameAsked) {
    // Já perguntou mas cliente não respondeu ainda
    nameInstruction = `
⏳ AGUARDANDO CONFIRMAÇÃO DE NOME
   Você já perguntou o nome do cliente nesta conversa.
   ❌ NÃO pergunte novamente
   ✅ Aguarde o cliente responder ou continue a conversa normalmente
   ✅ Se o cliente informar o nome, use update_contact com name_was_confirmed: true`;
   
  } else if (nameQuality === 'suspicious' || nameQuality === 'unknown') {
    // Nome parece ser do WhatsApp, precisa confirmar
    nameInstruction = `
⚠️ NOME PRECISA SER CONFIRMADO
   Nome atual: "${contact?.full_name || 'Não informado'}"
   Este nome veio do WhatsApp e provavelmente NÃO é o nome real.
   
   📋 O QUE FAZER:
   1. Na sua PRIMEIRA resposta, inclua naturalmente uma pergunta sobre o nome
      Exemplos:
      - "Antes de continuar, posso confirmar seu nome completo para nosso cadastro?"
      - "Para te atender melhor, qual seu nome completo?"
      - "Com quem estou falando? Gostaria de saber seu nome completo."
   
   2. IMEDIATAMENTE após perguntar, use a tool mark_name_asked
   
   3. Quando o cliente responder o nome, use update_contact com name_was_confirmed: true
   
   ❌ NÃO use update_contact para nome sem o cliente ter informado
   ❌ NÃO pergunte o nome mais de uma vez`;
   
  } else {
    // Nome parece real, mas ainda não foi confirmado explicitamente
    nameInstruction = `
ℹ️ NOME PARECE CORRETO: "${contact?.full_name}"
   O nome parece ser real, mas não foi confirmado pelo cliente.
   Você pode usar o nome normalmente.
   Se o cliente corrigir o nome, use update_contact com name_was_confirmed: true.`;
  }

  prompt += `
## 📛 STATUS DO NOME DO CONTATO
${nameInstruction}
`;

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

  // Add contact memories (PERSISTENT MEMORY)
  if (memories) {
    prompt += `
## MEMÓRIAS SOBRE ESTE CONTATO
⚠️ IMPORTANTE: Use estas informações para personalizar a conversa! O cliente já compartilhou isso anteriormente.

`;
    
    // Limit facts to last 8 to reduce tokens
    const allFacts = (memories.facts as string[]) || [];
    const facts = allFacts.slice(-8);
    if (facts.length > 0) {
      prompt += `### Fatos Importantes que Você Sabe
`;
      facts.forEach((fact: string) => {
        prompt += `- ${fact}
`;
      });
    }

    if (memories.next_action && memories.next_action_date) {
      prompt += `
### Próxima Ação Agendada
- ${memories.next_action} (Data: ${memories.next_action_date})
`;
    }

    const objections = (memories.objections as string[]) || [];
    if (objections.length > 0) {
      prompt += `
### Objeções já Levantadas
`;
      objections.forEach((obj: string) => {
        prompt += `- ${obj}
`;
      });
    }

    const qualification = (memories.qualification as Record<string, any>) || {};
    if (Object.keys(qualification).length > 0) {
      prompt += `
### Qualificação do Lead
- Nível de interesse: ${qualification.interest_level || 'não avaliado'}
- Tem orçamento: ${qualification.has_budget === true ? 'Sim' : qualification.has_budget === false ? 'Não' : 'Não confirmado'}
- Timeline: ${qualification.timeline || 'não definido'}
- Decisor: ${qualification.decision_maker === true ? 'Sim' : qualification.decision_maker === false ? 'Não' : 'Não confirmado'}
`;
    }
  }

  // Add tools instructions
  if (enabledTools.length > 0) {
    prompt += `
## FERRAMENTAS DISPONÍVEIS
Você tem acesso a ferramentas que DEVE usar quando apropriado:
`;
    if (enabledTools.includes('update_contact')) {
      prompt += `
- **update_contact**: Atualize informações do contato (email, telefone, empresa).
  Para NOME: use APENAS quando o cliente CONFIRMAR seu nome real.
  Sempre passe name_was_confirmed: true quando atualizar o nome.
  
- **mark_name_asked**: Use IMEDIATAMENTE após perguntar o nome do cliente.
  Isso evita que você pergunte o nome mais de uma vez na mesma conversa.
`;
    }
    if (enabledTools.includes('create_opportunity')) {
      prompt += `
- **create_opportunity**: Crie uma oportunidade quando identificar interesse claro de compra.
`;
    }
    if (enabledTools.includes('create_task')) {
      prompt += `
- **create_task**: Crie tarefas para follow-ups ou ações futuras.
`;
    }
    if (enabledTools.includes('transfer_to_human')) {
      prompt += `
- **transfer_to_human**: Transfira para humano quando o cliente pedir, o assunto for complexo, ou houver reclamação.
`;
    }
    if (enabledTools.includes('schedule_meeting')) {
      prompt += `
- **schedule_meeting**: Agende reuniões quando o cliente aceitar uma demonstração ou call.
`;
    }
    if (enabledTools.includes('save_memory')) {
      prompt += `
- **save_memory**: SEMPRE salve informações importantes que o cliente mencionar para lembrar em futuras conversas:
  • Datas importantes (dia de pagamento, aniversário, datas de viagem, etc)
  • Contexto pessoal (família, trabalho, hobbies, preferências)
  • Objeções e preocupações levantadas
  • Preferências e restrições (horários, canais de contato)
  • Próximos passos combinados com datas
  
  Exemplos de quando usar:
  - "só recebo dia 15" → save_memory({fact: "Recebe salário dia 15", next_action: "Retomar contato sobre pagamento", next_action_date: "2025-01-15"})
  - "preciso falar com minha esposa Maria" → save_memory({fact: "Esposa se chama Maria", objection: "Precisa consultar esposa"})
  - "meu orçamento é de no máximo 500 reais" → save_memory({fact: "Orçamento máximo de R$500", qualification: {has_budget: true}})
  - "estou muito interessado" → save_memory({qualification: {interest_level: "high"}})
`;
    }
  }

  // Add retrieved knowledge from RAG
  if (retrievedKnowledge.length > 0) {
    prompt += `
## CONHECIMENTO RELEVANTE PARA ESTA MENSAGEM
Use estas informações para responder com mais precisão:
`;
    retrievedKnowledge.forEach((item, i) => {
      const titlePart = item.title ? ` (${item.title})` : '';
      prompt += `
${i + 1}. [${item.type.toUpperCase()}]${titlePart}
${item.content}
`;
    });
  }

  // Add feedback rules (learned behavior from user feedback)
  const feedbackRules = (agent.feedback_rules as any[]) || [];
  const activeRules = feedbackRules.filter((r: any) => r.isActive !== false);
  if (activeRules.length > 0) {
    prompt += `
## REGRAS APRENDIDAS COM FEEDBACK
⚠️ PRIORIDADE ALTA - Estas regras têm precedência sobre as instruções gerais:
`;
    activeRules.slice(0, 20).forEach((rule: any) => {
      prompt += `- ${rule.trigger}: "${rule.response}"
`;
    });
  }

  // Add custom tool triggers if configured
  const toolTriggers = agent.tool_triggers as Record<string, string> | null;
  if (toolTriggers && Object.keys(toolTriggers).length > 0) {
    prompt += `
## GATILHOS ESPECÍFICOS DE FERRAMENTAS
`;
    Object.entries(toolTriggers).forEach(([tool, trigger]) => {
      prompt += `- **${tool}**: ${trigger}
`;
    });
  }

  prompt += `
## 🚨 REGRA ANTI-ALUCINAÇÃO - PRIORIDADE MÁXIMA
⚠️ ESTA REGRA TEM PRECEDÊNCIA SOBRE TODAS AS OUTRAS:

1. Se o "Conhecimento Relevante" (RAG_CONTEXT) acima estiver VAZIO ou NÃO mencionar o assunto perguntado:
   → NÃO invente preços, valores, prazos, processos ou serviços
   → NÃO finja que oferecemos serviços que não estão documentados
   → Responda EXATAMENTE: "Não tenho informações sobre isso na minha base de conhecimento. Posso ajudar com os serviços que oferecemos?"

2. Se o cliente perguntar sobre serviço que NÃO aparece no RAG_CONTEXT:
   → NÃO invente que oferecemos o serviço
   → NÃO invente preços ou processos
   → Diga que vai verificar com a equipe ou liste apenas os serviços que aparecem na base

3. NUNCA responda sobre: Green Card, EB1, EB2, EB3, EB4, EB5, vistos de trabalho (H1B, L1, O1), vistos de estudante (F1, J1), cidadania, processos de imigração permanente - A MENOS que estes estejam EXPLICITAMENTE no RAG_CONTEXT

## REGRAS IMPORTANTES
1. Responda APENAS com a mensagem para o cliente, sem explicações ou meta-comentários
2. Mantenha respostas concisas (máximo 3 parágrafos curtos)
3. Seja natural e humano na comunicação
4. Nunca invente informações sobre produtos ou preços
5. Se não souber algo, ofereça conectar com um especialista
6. Use as ferramentas disponíveis proativamente quando fizer sentido
7. SEMPRE confirme informações importantes antes de atualizar o CRM
8. Revise as ÚLTIMAS 3 mensagens do usuário para detectar correções ("não", "quis dizer", "na verdade")
9. NUNCA use tags [BUTTONS] ou formate opções como lista numerada (1. 2. 3.)
10. NUNCA ofereça "escolha uma opção" - responda de forma natural e fluída

## ⛔ REGRAS CRÍTICAS DE PAGAMENTO - NUNCA VIOLE
- NUNCA invente PIX, QR code, chave Pix, ou qualquer dado bancário
- NUNCA invente links de pagamento ou checkout
- Se o cliente pedir forma de pagamento, PIX, link, QR code, ou como pagar:
  → USE A FERRAMENTA send_payment_link 
  → Se a ferramenta não retornar um link válido, diga: "Vou verificar com a equipe o link correto e já te envio!"
- Palavras-chave que DEVEM acionar send_payment_link: "pix", "qr", "qrcode", "pagamento", "pagar", "link", "checkout", "como pago", "me manda o pix"
`;

  // Add formatting rules if configured
  const formattingRules = agent.formatting_rules as { max_consecutive_newlines?: number; strip_empty_lines?: boolean } | null;
  if (formattingRules?.strip_empty_lines || formattingRules?.max_consecutive_newlines === 1) {
    prompt += `
## 📝 REGRAS DE FORMATAÇÃO - OBRIGATÓRIO
⚠️ NUNCA use linhas em branco nas respostas
⚠️ Evite quebras de linha desnecessárias
⚠️ Mantenha respostas concisas em texto corrido
⚠️ Use no máximo 1 quebra de linha para separar ideias distintas
⚠️ Não coloque \\n\\n (duas quebras seguidas) NUNCA
`;
  }

  return prompt;
}

/**
 * Sanitize agent response based on formatting rules
 */
function sanitizeAgentResponse(
  response: string, 
  formattingRules: { max_consecutive_newlines?: number; strip_empty_lines?: boolean } | null
): string {
  if (!response) return response;
  
  const maxNewlines = formattingRules?.max_consecutive_newlines ?? 2;
  const stripEmpty = formattingRules?.strip_empty_lines ?? false;
  
  let sanitized = response;
  
  // Remove excessive newlines
  if (stripEmpty || maxNewlines === 1) {
    // Replace multiple newlines with at most maxNewlines
    const pattern = new RegExp(`\\n{${maxNewlines + 1},}`, 'g');
    sanitized = sanitized.replace(pattern, '\n'.repeat(maxNewlines));
  }
  
  // Trim start and end
  sanitized = sanitized.trim();
  
  return sanitized;
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
    // Include mark_name_asked automatically when update_contact is enabled
    const baseTools = (agent.enabled_tools as string[]) || ['update_contact', 'transfer_to_human'];
    const enabledTools = baseTools.includes('update_contact') && !baseTools.includes('mark_name_asked')
      ? [...baseTools, 'mark_name_asked']
      : baseTools;

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
        await dispatchWhatsAppSend({
          organizationId,
          threadId,
          message: agent.out_of_hours_message,
          isAgentMessage: true,
        } as any);
      }

      return new Response(
        JSON.stringify({ success: true, status: 'out_of_hours' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check message limit per conversation (per agent, per thread)
    const maxMessages = agent.max_messages_per_conversation || 200; // Default safe limit
    const { count: agentMessageCount } = await supabase
      .from('ai_agent_logs')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId) // Filter by agent to avoid counting other agents' messages
      .eq('thread_id', threadId)
      .eq('status', 'success');

    if (agentMessageCount && agentMessageCount >= maxMessages) {
      console.log(`Max messages reached for agent ${agentId}: ${agentMessageCount}/${maxMessages}`);
      
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
    const [contactResult, companyResult, opportunitiesResult, historyResult, memoriesResult] = await Promise.all([
      // Contact
      supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, phone, company_name, lifecycle_stage, source, company_id')
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
      
      // Message history - OPTIMIZED LIMIT to avoid rate limits
      supabase
        .from('messages')
        .select('content, direction, created_at, sender_type')
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Contact memories - PERSISTENT MEMORY
      supabase
        .from('contact_memories')
        .select('*')
        .eq('contact_id', contactId)
        .single(),
    ]);

    const contact = contactResult.data;
    const company = companyResult.data?.company as any;
    const opportunities = (opportunitiesResult.data || []).map((opp: any) => ({
      ...opp,
      stage_name: opp.pipeline_stage?.name,
    }));
    // Reverse to get chronological order
    const messageHistory = (historyResult.data || []).reverse();
    const memories = memoriesResult.data;

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

    // Check if agent has specific AI provider configured
    const agentProvider = agent.ai_provider as string | null;
    const agentModel = agent.ai_model as string | null;
    
    let integrationSlug: string;
    let configValues: Record<string, any>;
    let useAgentSpecificProvider = false;
    
    if (agentProvider && agentProvider !== 'auto') {
      // Use agent-specific provider
      useAgentSpecificProvider = true;
      integrationSlug = agentProvider;
      
      if (agentProvider === 'lovable-ai') {
        // Lovable AI uses LOVABLE_API_KEY from environment
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        if (!lovableApiKey) {
          console.error('LOVABLE_API_KEY not configured');
          return new Response(
            JSON.stringify({ error: 'Lovable AI not configured' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        configValues = { api_key: lovableApiKey, default_model: agentModel || 'google/gemini-3-flash-preview' };
      } else {
        // For claude-ai and openai-gpt, still need org integration for API key
        const specificIntegration = aiIntegrations.find(i => i.integration.slug === agentProvider);
        if (!specificIntegration) {
          console.error(`Agent requires ${agentProvider} but not configured`);
          return new Response(
            JSON.stringify({ error: `${agentProvider} integration not configured` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        configValues = specificIntegration.config_values as Record<string, any>;
        // Override model if agent specifies one
        if (agentModel) {
          configValues = { ...configValues, default_model: agentModel };
        }
      }
    } else {
      // Prefer Claude (original behavior)
      const aiIntegration = aiIntegrations.find(i => i.integration.slug === 'claude-ai') || aiIntegrations[0];
      integrationSlug = aiIntegration.integration.slug;
      configValues = aiIntegration.config_values as Record<string, any>;
    }

    if (!configValues?.api_key) {
      console.error('API key not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. PRODUCT DETECTION: Auto-detect product mentioned in message
    // Fetch all products for this organization
    const { data: orgProducts } = await supabase
      .from('products')
      .select('id, name, slug')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    // Function to detect product in message
    function detectProductInMessage(messageText: string, products: any[]): string | null {
      if (!products || products.length === 0) return null;
      const messageLower = messageText.toLowerCase();
      
      for (const product of products) {
        // Check product name
        if (product.name && messageLower.includes(product.name.toLowerCase())) {
          return product.id;
        }
        // Check product slug
        if (product.slug && messageLower.includes(product.slug.toLowerCase())) {
          return product.id;
        }
        // Check common variations (without hyphen, with space, etc)
        const variations = [
          product.slug?.replace(/-/g, ' '),
          product.slug?.replace(/-/g, ''),
          product.name?.replace(/-/g, ' '),
        ].filter(Boolean);
        
        for (const variation of variations) {
          if (variation && messageLower.includes(variation.toLowerCase())) {
            return product.id;
          }
        }
      }
      return null;
    }

    // Detect product in current message
    let detectedProductId = detectProductInMessage(message, orgProducts || []);

    // If not found in current message, check recent conversation history
    if (!detectedProductId && messageHistory.length > 0) {
      for (const msg of messageHistory.slice(-5).reverse()) {
        const detected = detectProductInMessage(msg.content || '', orgProducts || []);
        if (detected) {
          detectedProductId = detected;
          break;
        }
      }
    }

    const detectedProductName = detectedProductId 
      ? orgProducts?.find(p => p.id === detectedProductId)?.name 
      : null;
    console.log(`🎯 Product detection: ${detectedProductName || 'None (searching all knowledge)'}`);

    // 7. Search for relevant knowledge (RAG) - ONLY use INBOUND (user) messages for context
    // Assistant messages pollute semantic similarity and cause RAG to miss relevant chunks
    const recentUserMessages = messageHistory
      .filter(m => m.direction === 'inbound')
      .slice(-3) // Last 3 user messages only
      .map(m => m.content || '')
      .join(' ');

    // Prioritize current message; only add context if current message is short
    const searchContext = message.length < 50 && recentUserMessages 
      ? `${recentUserMessages} ${message}` 
      : message;
    console.log(`🔍 RAG search context (user messages only): "${searchContext.slice(0, 200)}..."`);
    
    // Pass detected productId to RAG search for 2-step product-first + global fallback
    const retrievedKnowledge = await searchRelevantKnowledge(supabase, searchContext, organizationId, agentId, detectedProductId);
    console.log(`📊 RAG Results: ${retrievedKnowledge.length} chunks (product: ${detectedProductId ? 'specific' : 'all'})`);

    // 8. Build system prompt with RAG knowledge
    const systemPrompt = buildSystemPrompt(agent, contact, company, opportunities, enabledTools, memories, retrievedKnowledge);

    // Build conversation messages for REAL memory - truncate long messages to save tokens
    const conversationMessages = messageHistory.map(msg => ({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: (msg.content || '').slice(0, 400),
    }));

    // Filter enabled tools
    const tools = AVAILABLE_TOOLS.filter(t => enabledTools.includes(t.function.name));

    let aiResponse: string = '';
    let tokensUsed = 0;
    let modelUsed = '';
    const toolsExecuted: string[] = [];

    if (integrationSlug === 'claude-ai') {
      const model = configValues.default_model || 'claude-sonnet-4-6';
      const maxTokens = 1024;
      modelUsed = model;

      // Build messages with history
      const claudeMessages = [
        ...conversationMessages,
        { role: 'user', content: message }
      ];

      const claudeBody: any = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: claudeMessages,
      };

      // Add tools if enabled
      if (tools.length > 0) {
        claudeBody.tools = tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        }));
      }

      let claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': configValues.api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(claudeBody),
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error('Claude API error:', claudeResponse.status, errorText);
        
        // Retry on rate limit (429)
        if (claudeResponse.status === 429) {
          console.log('Rate limit hit, waiting 2 seconds and retrying...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': configValues.api_key,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(claudeBody),
          });
          
          if (!claudeResponse.ok) {
            const retryErrorText = await claudeResponse.text();
            console.error('Claude API retry error:', claudeResponse.status, retryErrorText);
            throw new Error(`Claude API error after retry: ${claudeResponse.status}`);
          }
        } else {
          throw new Error(`Claude API error: ${claudeResponse.status}`);
        }
      }

      let claudeData = await claudeResponse.json();
      tokensUsed = (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0);

      // Handle tool calls with max iterations to prevent infinite loops
      const MAX_TOOL_ITERATIONS = 5;
      let toolIterations = 0;
      
      while (claudeData.stop_reason === 'tool_use' && toolIterations < MAX_TOOL_ITERATIONS) {
        toolIterations++;
        console.log(`Claude tool iteration ${toolIterations}/${MAX_TOOL_ITERATIONS}`);
        
        const toolUseBlocks = claudeData.content.filter((c: any) => c.type === 'tool_use');
        const toolResults = [];

        for (const toolUse of toolUseBlocks) {
          console.log(`Claude wants to use tool: ${toolUse.name}`);
          toolsExecuted.push(toolUse.name);
          
          const result = await executeTool(
            supabase,
            toolUse.name,
            toolUse.input,
            { contactId, organizationId, threadId }
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        // Continue conversation with tool results
        claudeMessages.push({ role: 'assistant', content: claudeData.content });
        claudeMessages.push({ role: 'user', content: toolResults as any });

        claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
            messages: claudeMessages,
            tools: claudeBody.tools,
          }),
        });

        if (!claudeResponse.ok) {
          const errorText = await claudeResponse.text();
          console.error('Claude API error (tool continuation):', claudeResponse.status, errorText);
          
          // Retry on rate limit for tool calls too
          if (claudeResponse.status === 429) {
            console.log('Rate limit hit on tool call, waiting 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
                messages: claudeMessages,
                tools: claudeBody.tools,
              }),
            });
            
            if (!claudeResponse.ok) {
              throw new Error(`Claude API error after retry: ${claudeResponse.status}`);
            }
          } else {
            throw new Error(`Claude API error: ${claudeResponse.status}`);
          }
        }

        claudeData = await claudeResponse.json();
        tokensUsed += (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0);
      }

      if (toolIterations >= MAX_TOOL_ITERATIONS) {
        console.warn(`Claude reached max tool iterations (${MAX_TOOL_ITERATIONS})`);
      }

      // Extract text response
      const textBlock = claudeData.content?.find((c: any) => c.type === 'text');
      aiResponse = textBlock?.text || '';

      // If response is empty after tool execution, retry without tools to force a text response
      if (!aiResponse && toolsExecuted.length > 0) {
        console.log('Claude: Empty response after tool execution, requesting final response without tools...');
        console.log(`Claude debug - stop_reason: ${claudeData.stop_reason}, content_types: ${claudeData.content?.map((c: any) => c.type).join(', ')}`);
        
        // Add instruction to force natural response
        claudeMessages.push({ 
          role: 'user', 
          content: 'As ferramentas foram executadas com sucesso. Agora responda ao cliente de forma natural e amigável, sem usar mais ferramentas.' 
        });
        
        const retryResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
            messages: claudeMessages,
            // Explicitly NOT passing tools to force text response
          }),
        });

        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          tokensUsed += (retryData.usage?.input_tokens || 0) + (retryData.usage?.output_tokens || 0);
          const retryTextBlock = retryData.content?.find((c: any) => c.type === 'text');
          aiResponse = retryTextBlock?.text || '';
          console.log('Claude retry response received:', aiResponse ? 'success' : 'still empty');
        } else {
          console.error('Claude retry request failed:', retryResponse.status);
        }
      }

    } else if (integrationSlug === 'openai-gpt') {
      const model = configValues.default_model || 'gpt-4o-mini';
      modelUsed = model;

      // Modelos novos usam max_completion_tokens em vez de max_tokens
      // E precisam de mais tokens para reasoning + resposta
      const isNewModel = ['gpt-5', 'gpt-4.5', 'o1', 'o3'].some(prefix => model.startsWith(prefix));
      const maxTokens = isNewModel ? 4096 : 1024;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${configValues.api_key}`,
      };

      // Build messages with history
      const openaiMessages = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages,
        { role: 'user', content: message },
      ];

      const openaiBody: any = {
        model,
        messages: openaiMessages,
      };

      // Aplicar parâmetro de tokens correto baseado no modelo
      if (isNewModel) {
        openaiBody.max_completion_tokens = maxTokens;
      } else {
        openaiBody.max_tokens = maxTokens;
      }

      // Add tools if enabled
      if (tools.length > 0) {
        openaiBody.tools = tools;
        openaiBody.tool_choice = 'auto';
      }

      let openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(openaiBody),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error('OpenAI API error:', openaiResponse.status, errorText);
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      let openaiData = await openaiResponse.json();
      tokensUsed = openaiData.usage?.total_tokens || 0;

      let responseMessage = openaiData.choices?.[0]?.message;

      // Handle tool calls
      while (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolResults = [];

        for (const toolCall of responseMessage.tool_calls) {
          console.log(`OpenAI wants to use tool: ${toolCall.function.name}`);
          toolsExecuted.push(toolCall.function.name);

          const result = await executeTool(
            supabase,
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments || '{}'),
            { contactId, organizationId, threadId }
          );

          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(result),
          });
        }

        // Continue conversation with tool results
        openaiMessages.push(responseMessage);
        openaiMessages.push(...toolResults);

        const retryBody: any = {
          model,
          messages: openaiMessages,
          tools: tools.length > 0 ? tools : undefined,
        };

        if (isNewModel) {
          retryBody.max_completion_tokens = maxTokens;
        } else {
          retryBody.max_tokens = maxTokens;
        }

        openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify(retryBody),
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          console.error('OpenAI API error (tool continuation):', openaiResponse.status, errorText);
          throw new Error(`OpenAI API error: ${openaiResponse.status}`);
        }

        openaiData = await openaiResponse.json();
        tokensUsed += openaiData.usage?.total_tokens || 0;
        responseMessage = openaiData.choices?.[0]?.message;
      }

      aiResponse = responseMessage?.content || '';

      // Log para debug de resposta vazia em modelos de raciocínio
      if (!aiResponse && responseMessage) {
        console.warn('Empty content from OpenAI. Model:', model, 'Full response:', JSON.stringify(responseMessage));
      }

    } else if (integrationSlug === 'lovable-ai') {
      // Lovable AI Gateway (OpenAI-compatible)
      const model = configValues.default_model || 'google/gemini-3-flash-preview';
      const maxTokens = 1024;
      modelUsed = model;

      const lovableMessages = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages,
        { role: 'user', content: message },
      ];

      const lovableBody: any = {
        model,
        max_tokens: maxTokens,
        messages: lovableMessages,
      };

      // Add tools if enabled
      if (tools.length > 0) {
        lovableBody.tools = tools;
        lovableBody.tool_choice = 'auto';
      }

      let lovableResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${configValues.api_key}`,
        },
        body: JSON.stringify(lovableBody),
      });

      if (!lovableResponse.ok) {
        const errorText = await lovableResponse.text();
        console.error('Lovable AI API error:', lovableResponse.status, errorText);
        throw new Error(`Lovable AI API error: ${lovableResponse.status}`);
      }

      let lovableData = await lovableResponse.json();
      tokensUsed = lovableData.usage?.total_tokens || 0;

      let responseMessage = lovableData.choices?.[0]?.message;

      // Handle tool calls (OpenAI-compatible format)
      while (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolResults = [];

        for (const toolCall of responseMessage.tool_calls) {
          console.log(`Lovable AI wants to use tool: ${toolCall.function.name}`);
          toolsExecuted.push(toolCall.function.name);

          const result = await executeTool(
            supabase,
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments || '{}'),
            { contactId, organizationId, threadId }
          );

          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(result),
          });
        }

        // Continue conversation with tool results
        lovableMessages.push(responseMessage);
        lovableMessages.push(...toolResults);

        lovableResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${configValues.api_key}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: lovableMessages,
            tools: tools.length > 0 ? tools : undefined,
          }),
        });

        if (!lovableResponse.ok) {
          const errorText = await lovableResponse.text();
          console.error('Lovable AI API error (tool continuation):', lovableResponse.status, errorText);
          throw new Error(`Lovable AI API error: ${lovableResponse.status}`);
        }

        lovableData = await lovableResponse.json();
        tokensUsed += lovableData.usage?.total_tokens || 0;
        responseMessage = lovableData.choices?.[0]?.message;
      }

      aiResponse = responseMessage?.content || '';

      // If response is empty after tool execution, retry without tools to force a text response
      if (!aiResponse && toolsExecuted.length > 0) {
        console.log('Empty response after tool execution, requesting final response without tools...');
        
        // Add a system instruction to force a response
        lovableMessages.push({
          role: 'user',
          content: '[Sistema: As ferramentas foram executadas com sucesso. Agora responda ao cliente de forma natural, sem usar mais ferramentas.]'
        });
        
        const retryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${configValues.api_key}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: lovableMessages,
            // Explicitly NOT passing tools to force text response
          }),
        });

        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          tokensUsed += retryData.usage?.total_tokens || 0;
          aiResponse = retryData.choices?.[0]?.message?.content || '';
          console.log('Retry response received:', aiResponse ? 'success' : 'still empty');
        } else {
          console.error('Retry request failed:', retryResponse.status);
        }
      }
    }

    // Apply formatting rules to sanitize response
    const formattingRules = agent.formatting_rules as { max_consecutive_newlines?: number; strip_empty_lines?: boolean } | null;
    if (aiResponse) {
      aiResponse = sanitizeAgentResponse(aiResponse, formattingRules);
    }

    // Graceful fallback if still no response - with detailed logging
    let fallbackUsed = false;
    let fallbackReason = '';
    
    if (!aiResponse) {
      fallbackUsed = true;
      fallbackReason = toolsExecuted.length > 0 
        ? `empty_response_after_tools:${toolsExecuted.join(',')}` 
        : 'empty_response_no_tools';
      
      console.warn(`Using fallback response - reason: ${fallbackReason}, provider: ${integrationSlug}, model: ${modelUsed}`);
      aiResponse = 'Desculpe, não consegui processar sua mensagem no momento. Pode repetir?';
    }

    const responseTime = Date.now() - startTime;

    // 7. Check if this is test mode - don't send to WhatsApp, just return response
    if (isTestMode) {
      console.log(`AI Agent TEST MODE response - ${responseTime}ms, ${tokensUsed} tokens, tools: ${toolsExecuted.join(', ') || 'none'}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          response: aiResponse,
          responseTime,
          tokensUsed,
          toolsExecuted,
          isTestMode: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Send response via WhatsApp (production mode)
    const { error: sendError } = await dispatchWhatsAppSend({
      organizationId,
      contactId,
      threadId,
      message: aiResponse,
      isAgentMessage: true,
      agentId: agent.id,
      senderName: agent.name,
    });

    if (sendError) {
      console.error('Error sending WhatsApp message:', sendError);
      throw new Error('Failed to send WhatsApp message');
    }

    // 9. Log successful interaction (with fallback info if applicable)
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
        tools_executed: toolsExecuted,
        fallback_used: fallbackUsed,
        fallback_reason: fallbackReason || null,
        provider: integrationSlug,
      },
      response_time_ms: responseTime,
      tokens_used: tokensUsed,
      model_used: modelUsed,
      status: fallbackUsed ? 'fallback' : 'success',
      error_message: fallbackReason || null,
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

    console.log(`AI Agent response sent - ${responseTime}ms, ${tokensUsed} tokens, tools: ${toolsExecuted.join(', ') || 'none'}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: aiResponse,
        responseTime,
        tokensUsed,
        toolsExecuted,
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
