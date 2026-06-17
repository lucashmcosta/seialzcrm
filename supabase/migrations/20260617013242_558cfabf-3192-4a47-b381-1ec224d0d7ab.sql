SET lock_timeout = '5s';
SET statement_timeout = '60s';

DROP INDEX IF EXISTS public.message_threads_unique_open_per_contact;

CREATE UNIQUE INDEX message_threads_unique_open_per_contact_endpoint
  ON public.message_threads (organization_id, contact_id, channel, primary_endpoint_id)
  WHERE status IN ('open', 'awaiting_client', 'in_progress')
    AND primary_endpoint_id IS NOT NULL;

CREATE UNIQUE INDEX message_threads_unique_open_per_contact_legacy
  ON public.message_threads (organization_id, contact_id, channel)
  WHERE status IN ('open', 'awaiting_client', 'in_progress')
    AND primary_endpoint_id IS NULL;