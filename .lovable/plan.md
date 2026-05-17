## Backfill do template auto-WA — CT FORM REVISAO CALCULO v1

### Diagnóstico
- Form: `CT FORM REVISAO CALCULO v1` (id `3228fa96…`, org Central Trabalhista — único form Meta da org)
- Template configurado: `2445dad6-2155-41c1-ac30-a68fb9b2d2f7`, sem variáveis
- Janela: últimos 7 dias
- **74 contatos únicos** com oportunidade `source=meta_lead_ads` mas SEM mensagem outbound com `template_id` na janela ±30min da criação da oportunidade. Casos como Maria Zélia, Cleito, Gildo, Kátia, Cleusa, etc. caíram aqui (CTWA+Form: contato já existia → `!existingId` falhou → template pulado).

### Etapas

**1. Gerar e exibir a lista para sua aprovação**
Vou rodar um SELECT idêntico ao de contagem e te entregar uma tabela com:
- `contact_id`, `full_name`, `phone`, `opportunity_id`, `created_at`
- Marcação de risco: contatos com mensagem outbound (qualquer, não-template) recente, indicando que já houve interação humana — para você decidir se exclui

Você revisa e me responde:
- "manda todos" → segue passo 2 para os 74
- "exclui X, Y, Z" → removo da lista
- "só essa lista reduzida" → uso o subset

**2. Disparo controlado via `twilio-whatsapp-send`**
Script one-off (executado via `code--exec` chamando a edge function deployada) que, para cada contato aprovado:
- POST em `/twilio-whatsapp-send` com:
  - `organizationId`: `40ae935c…`
  - `contactId`: do lead
  - `templateId`: `2445dad6-2155-41c1-ac30-a68fb9b2d2f7`
  - `templateVariables`: `{}` (settings não tem variáveis)
  - `isAgentMessage: false`, `senderName: "Meta Lead Ads (backfill)"`
- Autorização: token interno via RPC `get_internal_function_auth_token` (mesma estratégia do process-lead)
- Throttle: 200ms entre envios
- Loga sucesso/erro por contato; ao final, resumo agregado

**3. Relatório final**
Te mostro:
- Quantos enviados com sucesso (com SID Twilio)
- Quantos falharam (motivo: telefone inválido, erro Twilio, etc.)
- Lista detalhada dos falhos para tratamento manual

### O que NÃO será mexido
- Código de produção (process-lead, poll, webhook) — zero alteração
- Regra `!existingId` permanece como está (sua decisão)
- Nenhum dado é criado/alterado no banco além da mensagem outbound padrão que o `twilio-whatsapp-send` já cria (mensagem + activity), exatamente como se fosse um envio manual de template pelo CRM
- Nenhum contato/oportunidade é tocado

### Salvaguardas
- Filtro estrito: só contatos com `phone IS NOT NULL` e oportunidade `meta_lead_ads` nos últimos 7 dias da org Central Trabalhista
- Dedupe por `contact_id` (se houver 2 opps pro mesmo contato, dispara só 1 template)
- Aprovação explícita da lista antes do disparo
- Janela 24h: o `twilio-whatsapp-send` usa template (ContentSid), então ignora a checagem de 24h — funciona mesmo fora da janela
