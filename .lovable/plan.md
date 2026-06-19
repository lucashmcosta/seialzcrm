## Objetivo
Finalizar a importação dos ~375 leads Meta restantes da Viagi e entregar relatório final.

## Mudanças

### 1. `supabase/functions/meta-lead-ads-process-lead/index.ts`
Quando uma colisão de telefone retornar um contato existente (branch de recuperação por `phone`/`phone_normalized`):
- Se o contato existente NÃO tiver `source_external_id`, fazer `UPDATE` setando `source_external_id = <novo lead_id>` e (se vazios) `source='meta_lead_ads'`, `marketing_campaign_id`, `ad_referral_*`, `utm_*`.
- Se já tiver `source_external_id` diferente, apenas anexar `meta_lead_ads` ao `attribution_path` (sem sobrescrever) e registrar no log que o lead foi mesclado.
- Em ambos os casos, marcar internamente o processamento como sucesso para que a recovery conte como `already_imported`/`merged` e o lead não seja re-despachado.

### 2. `supabase/functions/meta-lead-ads-recovery-viagi/index.ts`
- Ampliar a checagem de idempotência: antes de despachar, considerar "já importado" se houver contato na org com `source='meta_lead_ads'` cujo telefone (E.164 ou `phone_normalized`) bata com o telefone do lead Meta — não apenas `source_external_id`.
- Manter `auto_send_whatsapp` ativado e round-robin (Ketlyn/Marlisa).
- Rodar em lotes de 15 até `remaining = 0`.

### 3. Execução
1. Deploy das duas funções.
2. Rodar `recovery-viagi` em `apply` mode, lotes de 15, em loop até `pending=0` ou `dispatched=0` por 2 iterações seguidas (evita loops infinitos).
3. Coletar contadores finais via SQL:
   - contatos criados no período (`source='meta_lead_ads'`, `created_at >= 2026-06-12`)
   - oportunidades criadas no mesmo critério
   - mensagens WhatsApp automáticas disparadas
   - leads ainda pendentes no Meta (sample dos não importáveis)

## Entrega
Relatório final no chat com:
- Total de leads no gap (561)
- Contatos novos criados
- Contatos existentes mesclados (com `source_external_id` atualizado)
- Oportunidades criadas em "Novo"
- Mensagens automáticas enviadas / falhas
- Leads não importados + motivo
- Status do poller (erros zerados, `last_synced_lead_created_time` atualizado)
