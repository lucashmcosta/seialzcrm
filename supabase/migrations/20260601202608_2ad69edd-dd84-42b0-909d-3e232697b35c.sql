UPDATE public.contacts c
SET lifecycle_stage = 'customer',
    updated_at = now()
WHERE c.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND c.deleted_at IS NULL
  AND c.lifecycle_stage IS DISTINCT FROM 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.contact_id = c.id
      AND o.organization_id = c.organization_id
      AND o.deleted_at IS NULL
      AND o.status = 'won'
  );