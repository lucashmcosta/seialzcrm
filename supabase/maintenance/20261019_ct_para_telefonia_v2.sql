-- Passo operacional: colocar a Central Trabalhista na telefonia v2.
--
-- EXECUTAR NA MESMA JANELA do reapontamento do webhook no Twilio, nesta ordem:
--
--   1. este script (liga a flag)
--   2. rodar o setup de telefonia pela tela de integração -- o twilio-setup já
--      escolhe `telephony-webhook/voice` em vez de `twilio-webhook/voice`
--      quando a flag está ligada (twilio-setup/index.ts:132-133)
--   3. uma ligação de teste
--
-- NÃO é migration de propósito: com a flag ligada e o webhook ainda apontando
-- para a v1, o frontend cria a ligação pelo caminho novo e o Twilio bate no
-- handler antigo. Os dois passos andam juntos.
--
-- Para VOLTAR: trocar array_append por array_remove abaixo e rodar o setup de
-- novo. Minutos, sem deploy.

update public.feature_flags
   set organization_ids = array_append(
         coalesce(organization_ids, array[]::uuid[]),
         '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid),
       updated_at = now()
 where name = 'telephony_v2'
   and not ('40ae935c-a7f7-4ad7-8ea4-91be6404a95f' = any(coalesce(organization_ids, array[]::uuid[])));

select name,
       is_enabled,
       array_length(organization_ids, 1) as orgs,
       '40ae935c-a7f7-4ad7-8ea4-91be6404a95f' = any(organization_ids) as inclui_ct
  from public.feature_flags
 where name = 'telephony_v2';
