-- Fase 1 — Shadow ingest SuvSign
-- Liga somente inbox_v2.ingest.suvsign. As demais flags permanecem desligadas.

UPDATE public.integration_feature_flags
   SET enabled = true,
       updated_at = now()
 WHERE flag_key = 'inbox_v2.ingest.suvsign'
   AND organization_id IS NULL;

-- Garantia explícita (idempotente) de que as outras flags permanecem OFF
UPDATE public.integration_feature_flags
   SET enabled = false,
       updated_at = now()
 WHERE flag_key IN (
         'inbox_v2.dispatch.suvsign',
         'inbox_v2.write.suvsign',
         'inbox_v2.cutover.suvsign'
       )
   AND organization_id IS NULL
   AND enabled = true; -- só toca se estiver inadvertidamente ligada
