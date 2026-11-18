-- Glossário: um só status para conversa encerrada. 'closed' é legado (nenhum código grava mais);
-- todo o sistema já trata 'closed' igual a 'resolved'. Unifica para a aba "Encerradas" mostrar todas.
UPDATE public.message_threads
SET status = 'resolved', resolved_at = coalesce(resolved_at, updated_at)
WHERE status = 'closed';
