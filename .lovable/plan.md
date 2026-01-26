
# Plano: Sincronizar Formatação CRM = WhatsApp

## Problema Identificado

O Railway envia a mensagem para o WhatsApp **antes** de salvar no Supabase:
1. Railway → envia com `\n\n` (parágrafos) → WhatsApp mostra bonito ✅
2. Railway → salva no Supabase → trigger comprime para `\n` → CRM mostra feio ❌

## Solução em 2 Partes

### Parte 1: Atualizar Configuração do Agente Lucas

| Campo | Valor Atual | Novo Valor |
|-------|-------------|------------|
| `max_consecutive_newlines` | 1 | 2 |
| `strip_empty_lines` | true | false |

Isso permite parágrafos e evita que o trigger destrua a formatação.

### Parte 2: Alterar Fluxo no Railway

O Railway precisa mudar de:
```
Gera resposta → Envia WhatsApp → Salva no Supabase
```

Para:
```
Gera resposta → Salva no Supabase (trigger aplica formatting) → Envia WhatsApp
```

Assim o trigger do banco normaliza ANTES do envio, garantindo que:
- O texto salvo = texto enviado = texto exibido no CRM

## Arquivos/Mudanças Necessárias

| Local | Ação | Descrição |
|-------|------|-----------|
| Supabase (ai_agents) | UPDATE | Mudar formatting_rules do Lucas |
| Railway Backend | Modificar | Inverter ordem: salvar → buscar → enviar |

## Implementação Detalhada

### 1. UPDATE no Supabase

```sql
UPDATE ai_agents
SET formatting_rules = jsonb_build_object(
  'max_consecutive_newlines', 2,
  'strip_empty_lines', false
)
WHERE id = 'ea45e397-d87b-4e4d-ba14-95b5baf7cb2c';
```

### 2. Modificação no Railway (guia para você)

O código do Railway precisa seguir este padrão:

```typescript
// ANTES (problemático)
const response = await generateAIResponse(...);
await sendToWhatsApp(response);  // Cliente recebe com \n\n
await saveToSupabase(response);  // Trigger comprime para \n

// DEPOIS (correto)
const response = await generateAIResponse(...);

// 1. Salva primeiro (trigger aplica formatting_rules)
const { data: savedMessage } = await supabase
  .from('messages')
  .insert({
    content: response,
    direction: 'outbound',
    sender_type: 'agent',
    thread_id: threadId,
    whatsapp_status: 'pending',
    // ... outros campos
  })
  .select('content')  // Busca o content já normalizado
  .single();

// 2. Envia o texto normalizado pelo trigger
await sendToWhatsApp(savedMessage.content);

// 3. Atualiza status
await supabase
  .from('messages')
  .update({ whatsapp_status: 'sent' })
  .eq('id', savedMessage.id);
```

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| WhatsApp: 4 parágrafos | WhatsApp: 4 parágrafos ✅ |
| CRM: texto corrido | CRM: 4 parágrafos ✅ |

## Seção Técnica

### Por que o trigger é importante?

O trigger `sanitize_agent_message` aplica:
1. `sender_name` automático (busca do agente ativo)
2. `sender_agent_id` automático
3. `formatting_rules` (max_consecutive_newlines, trim)

Se você salvar ANTES de enviar, o trigger garante consistência entre banco e WhatsApp.

### Fluxo Ideal

```text
Railway gera resposta
       ↓
INSERT no Supabase (trigger sanitiza)
       ↓
SELECT content (já normalizado)
       ↓
Envia para Twilio/WhatsApp
       ↓
UPDATE whatsapp_status = 'sent'
```

### Checklist para Railway

1. Gerar resposta AI normalmente
2. **INSERT** na tabela `messages` com `whatsapp_status: 'pending'`
3. **SELECT** o campo `content` do registro inserido (já passou pelo trigger)
4. Enviar esse `content` para Twilio
5. **UPDATE** o registro com `whatsapp_status: 'sent'` e `whatsapp_message_sid`

Isso garante que o texto exibido no CRM é IDÊNTICO ao enviado pro cliente.
