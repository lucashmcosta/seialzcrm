-- O padrão 'geral' não existe em ki_category_check, então todo insert sem categoria falhava.
alter table public.knowledge_items alter column category set default 'general';
