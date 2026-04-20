-- 1) Simplificar função RR
CREATE OR REPLACE FUNCTION public.assign_round_robin(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_user_id uuid;
  v_uo_id uuid;
BEGIN
  SELECT round_robin_enabled INTO v_enabled
  FROM organizations WHERE id = _org_id;

  IF v_enabled IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  SELECT uo.id, uo.user_id
  INTO v_uo_id, v_user_id
  FROM user_organizations uo
  WHERE uo.organization_id = _org_id
    AND uo.is_active = true
    AND uo.round_robin_active = true
  ORDER BY uo.last_assigned_at NULLS FIRST, uo.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE user_organizations
  SET last_assigned_at = now()
  WHERE id = v_uo_id;

  RETURN v_user_id;
END;
$function$;

-- 2) Backfill: atribuir todos os órfãos da Central a Tamires
DO $$
DECLARE
  v_org uuid;
  v_tamires uuid;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE name = 'Central Trabalhista' LIMIT 1;
  SELECT id INTO v_tamires FROM users WHERE full_name ILIKE 'Tamires%' AND id IN (
    SELECT user_id FROM user_organizations WHERE organization_id = v_org AND is_active = true
  ) LIMIT 1;

  IF v_org IS NOT NULL AND v_tamires IS NOT NULL THEN
    UPDATE contacts SET owner_user_id = v_tamires
    WHERE organization_id = v_org AND owner_user_id IS NULL AND deleted_at IS NULL;

    UPDATE opportunities SET owner_user_id = v_tamires
    WHERE organization_id = v_org AND owner_user_id IS NULL AND deleted_at IS NULL;

    UPDATE message_threads
    SET assigned_user_id = v_tamires,
        original_owner_user_id = COALESCE(original_owner_user_id, v_tamires)
    WHERE organization_id = v_org AND assigned_user_id IS NULL;
  END IF;
END $$;