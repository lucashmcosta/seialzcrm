-- Pausar o agente de IA numa conversa: a equipe cala o agente nesta conversa até uma
-- data (2 h, 24 h ou "até reativar" = data distante). ai-agent-respond não responde
-- enquanto ai_agent_paused_until > now(). Vale para qualquer agente e organização.
alter table public.message_threads add column if not exists ai_agent_paused_until timestamptz;
comment on column public.message_threads.ai_agent_paused_until is
  'O agente de IA não responde nesta conversa até esta data (pausa manual da equipe). Null = sem pausa.';
