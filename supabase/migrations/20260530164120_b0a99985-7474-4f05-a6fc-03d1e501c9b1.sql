-- Fase 0: incluir 'in_progress' no índice único de thread aberta por (org, contact, channel)
-- Índice atual confirmado: message_threads_unique_open_per_contact
-- Filtro atual: status IN ('open','awaiting_client')
-- Novo filtro: status IN ('open','awaiting_client','in_progress')

DROP INDEX IF EXISTS public.message_threads_unique_open_per_contact;

CREATE UNIQUE INDEX message_threads_unique_open_per_contact
ON public.message_threads (organization_id, contact_id, channel)
WHERE status IN ('open', 'awaiting_client', 'in_progress');