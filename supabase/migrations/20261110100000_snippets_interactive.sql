-- Respostas rápidas com botões, lista ou botão de link.
-- `interactive` segue o formato de _shared/whatsapp-interactive.ts (InteractivePayload).
-- `body` continua com o texto equivalente, para busca e para provedores sem botões.
alter table public.message_snippets add column if not exists interactive jsonb;
