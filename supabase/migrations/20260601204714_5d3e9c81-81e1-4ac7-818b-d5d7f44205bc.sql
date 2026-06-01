UPDATE public.contacts c
SET lifecycle_stage = 'customer',
    updated_at = now()
WHERE c.organization_id = 'b246ef6f-6242-4011-a112-6d8783d2896a'
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