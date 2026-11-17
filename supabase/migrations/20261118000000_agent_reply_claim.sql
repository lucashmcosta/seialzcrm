-- Uma resposta do agente por mensagem do cliente.
--
-- Quando o cliente manda duas mensagens no mesmo segundo (ex.: duas fotos), o webhook abre duas
-- chamadas do ai-agent-respond. Depois da espera, nenhuma vê a outra mensagem como "mais nova" e as
-- duas respondiam. Agora a chamada grava aqui o id da última mensagem do cliente com um UPDATE
-- condicional: só uma consegue, e só ela responde.
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS ai_agent_reply_claim_message_id uuid;

COMMENT ON COLUMN public.message_threads.ai_agent_reply_claim_message_id IS
  'Última mensagem do cliente que já tem uma chamada do agente respondendo (ai-agent-respond). Evita duas respostas para mensagens do mesmo segundo.';
