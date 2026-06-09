CREATE OR REPLACE FUNCTION public.can_review_contact_documents(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = _contact_id
      AND c.organization_id = ANY (current_user_org_ids())
      AND is_org_admin(c.organization_id)
  );
$$;