-- Botão "Não tenho interesse" na retomada do agente (mensagem de sessão, sem template).
-- null = desligado (padrão: nenhum agente muda de comportamento), 1 = na 1ª retomada, 2 = na 2ª.
-- Se a configuração pede a 2ª e o agente só tem 1 retomada, o botão vai na última.
-- O toque encerra a conversa do agente e registra a recusa de marketing no WhatsApp.
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS followup_optout_attempt smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_agents_followup_optout_attempt_check') THEN
    ALTER TABLE public.ai_agents
      ADD CONSTRAINT ai_agents_followup_optout_attempt_check
      CHECK (followup_optout_attempt IS NULL OR followup_optout_attempt BETWEEN 1 AND 2);
  END IF;
END $$;

COMMENT ON COLUMN public.ai_agents.followup_optout_attempt IS
  'Em qual retomada vai o botão "Não tenho interesse" (1 ou 2). null = sem botão.';
