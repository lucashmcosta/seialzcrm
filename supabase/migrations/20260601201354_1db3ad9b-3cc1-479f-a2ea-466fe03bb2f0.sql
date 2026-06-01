UPDATE public.communication_endpoints
SET purpose = 'other',
    provider = NULL,
    updated_at = now()
WHERE id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'
  AND organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';