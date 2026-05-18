-- 1) Backfill direto: oportunidade ganha + anexo assinado nela mesma
WITH primeiro_anexo AS (
  SELECT a.entity_id AS opp_id, MIN(a.created_at) AS signed_at
  FROM public.attachments a
  WHERE a.entity_type = 'opportunity'
    AND a.file_name ILIKE '%assinado%'
  GROUP BY a.entity_id
)
UPDATE public.opportunities o
SET close_date = pa.signed_at::date
FROM primeiro_anexo pa
WHERE o.id = pa.opp_id
  AND o.deleted_at IS NULL
  AND o.status = 'won'
  AND o.close_date IS NULL;

-- 2) Backfill via contato: oportunidade ganha sem anexo, mas outra oportunidade
-- do mesmo contato tem anexo assinado (cliente assina apenas 1 contrato).
WITH alvo AS (
  SELECT o.id, o.contact_id
  FROM public.opportunities o
  WHERE o.deleted_at IS NULL
    AND o.status = 'won'
    AND o.close_date IS NULL
    AND o.contact_id IS NOT NULL
),
candidato AS (
  SELECT a.contact_id, MAX(att.created_at) AS signed_at
  FROM alvo a
  JOIN public.opportunities o2
    ON o2.contact_id = a.contact_id
   AND o2.id <> a.id
   AND o2.deleted_at IS NULL
  JOIN public.attachments att
    ON att.entity_type = 'opportunity'
   AND att.entity_id = o2.id
   AND att.file_name ILIKE '%assinado%'
  GROUP BY a.contact_id
)
UPDATE public.opportunities o
SET close_date = c.signed_at::date
FROM candidato c
WHERE o.contact_id = c.contact_id
  AND o.deleted_at IS NULL
  AND o.status = 'won'
  AND o.close_date IS NULL;