## Limpeza pós-teste do Meta Lead Ads → WhatsApp

### O que será removido

**1. Dados de teste em Central Trabalhista (org `40ae935c`)**
Tudo ligado ao contato `Teste Lovable v3` (`+5511985658770`, id `d207964f`):
- 1 contato
- 1 oportunidade (`76f299f6` — a que você visualizou agora há pouco)
- 1 thread de WhatsApp + mensagens enviadas (template "Viagi - Twilio API")
- 4 atividades vinculadas

Ordem da exclusão (via insert tool com `DELETE`):
1. `messages` da thread `5d9117b5`
2. `message_threads` `5d9117b5`
3. `activities` (4 ids)
4. `opportunities` `76f299f6`
5. `contacts` `d207964f`

**2. Edge function de teste**
- Apagar `supabase/functions/dev-trigger-test-meta-lead/` do código
- Chamar `supabase--delete_edge_functions(["dev-trigger-test-meta-lead"])` para remover o deploy

### O que NÃO será mexido
- Código de produção do `meta-lead-ads-process-lead` (o fix do Vault permanece)
- Configuração do sender Twilio (`+551150287027`) — quem ajusta o display name é você no Twilio Console
- Qualquer outro contato/lead real da Central Trabalhista
