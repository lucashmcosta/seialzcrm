-- Como o agente se apresenta. true (padrão, comportamento de antes): "assistente virtual".
-- false: só pelo nome, como alguém da equipe. Em qualquer caso, se perguntarem
-- diretamente se é pessoa ou IA, ele diz a verdade (regra fixa no ai-agent-respond).
alter table public.ai_agents add column if not exists presents_as_assistant boolean not null default true;
