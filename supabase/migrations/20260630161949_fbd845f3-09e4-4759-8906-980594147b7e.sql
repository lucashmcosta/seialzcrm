UPDATE public.message_threads t
SET primary_endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
WHERE t.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND t.primary_endpoint_id IS DISTINCT FROM '407ff93d-4860-49cd-82ae-beda456c1774'
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.thread_id = t.id
      AND m.direction = 'internal'
      AND m.metadata->>'kind' = 'endpoint_migration_meta_7020'
  );