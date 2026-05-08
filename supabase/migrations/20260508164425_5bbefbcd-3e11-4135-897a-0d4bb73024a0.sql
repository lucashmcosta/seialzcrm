-- Close older duplicate open threads, keeping the one most recently active per (org, contact, channel)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, contact_id, channel
           ORDER BY COALESCE(last_message_at, created_at) DESC, created_at DESC
         ) AS rn
  FROM public.message_threads
  WHERE status IN ('open','awaiting_client')
)
UPDATE public.message_threads mt
SET status = 'resolved',
    resolved_at = now(),
    updated_at = now()
FROM ranked
WHERE mt.id = ranked.id AND ranked.rn > 1;

-- Now safe to create the unique index
CREATE UNIQUE INDEX IF NOT EXISTS message_threads_unique_open_per_contact
ON public.message_threads (organization_id, contact_id, channel)
WHERE status IN ('open', 'awaiting_client');