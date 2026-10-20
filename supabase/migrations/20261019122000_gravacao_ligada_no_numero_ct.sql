-- Liga a gravação no número principal da Central Trabalhista.
--
-- Por que isto pode ser migration e a troca da flag telephony_v2 NÃO pode:
--
-- Esta coluna só é lida pelo webhook da v2. Enquanto a CT estiver na v1 ela é
-- INERTE -- a v1 decide por organization_integrations.config_values
-- .enable_recording, que já está `true` e nunca gravou nada (o callback da v1
-- procura a ligação por `call_sid`, que só é salvo em 0,8% delas).
--
-- Já a flag telephony_v2 precisa ser trocada JUNTO com o reapontamento do
-- webhook no Twilio: com a flag ligada e o webhook ainda na v1, o frontend cria
-- a ligação pelo caminho novo e o Twilio bate no handler antigo. Por isso ela
-- fica num script de manutenção, executado na mesma janela do setup, e não aqui.

update public.organization_phone_numbers
   set recording_enabled = true, updated_at = now()
 where organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
   and is_active;
