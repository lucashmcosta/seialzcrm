CREATE OR REPLACE FUNCTION public.rpc_register_push_token_v2(p_expo_push_token text, p_platform text, p_app_version text DEFAULT NULL::text, p_supports_read_sync boolean DEFAULT false)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_id uuid;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0002';
  END IF;
  IF nullif(btrim(coalesce(p_expo_push_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_TOKEN' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_push_tokens SET is_active = false, updated_at = now()
   WHERE expo_push_token = btrim(p_expo_push_token) AND user_id <> v_user_id AND is_active;

  INSERT INTO public.user_push_tokens (
    user_id, expo_push_token, platform, is_active, last_seen_at,
    app_version, supports_read_sync
  ) VALUES (
    v_user_id, btrim(p_expo_push_token), coalesce(p_platform, 'unknown'), true, now(),
    nullif(btrim(coalesce(p_app_version, '')), ''), coalesce(p_supports_read_sync, false)
  )
  ON CONFLICT (user_id, expo_push_token) DO UPDATE
    SET platform = coalesce(excluded.platform, public.user_push_tokens.platform),
        is_active = true,
        last_seen_at = now(),
        app_version = coalesce(excluded.app_version, public.user_push_tokens.app_version),
        supports_read_sync = excluded.supports_read_sync,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_register_push_token(p_expo_push_token text, p_platform text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := current_user_id();
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF coalesce(trim(p_expo_push_token), '') = '' THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  IF p_platform NOT IN ('ios','android') THEN
    RAISE EXCEPTION 'invalid_platform';
  END IF;

  UPDATE public.user_push_tokens SET is_active = false, updated_at = now()
   WHERE expo_push_token = trim(p_expo_push_token) AND user_id <> v_user_id AND is_active;

  INSERT INTO public.user_push_tokens (user_id, expo_push_token, platform)
  VALUES (v_user_id, trim(p_expo_push_token), p_platform)
  ON CONFLICT (user_id, expo_push_token) DO UPDATE
    SET is_active = true,
        platform = EXCLUDED.platform,
        last_seen_at = now(),
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_deactivate_push_tokens_on_membership_loss()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_user := OLD.user_id;
    ELSIF OLD.is_active AND NOT NEW.is_active THEN
      v_user := NEW.user_id;
    END IF;
    IF v_user IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.user_organizations uo WHERE uo.user_id = v_user AND uo.is_active
    ) THEN
      UPDATE public.user_push_tokens SET is_active = false, updated_at = now()
       WHERE user_id = v_user AND is_active;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'fn_deactivate_push_tokens_on_membership_loss: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_deactivate_push_tokens_on_membership_loss() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_deactivate_push_tokens_on_membership_loss
AFTER UPDATE OF is_active OR DELETE ON public.user_organizations
FOR EACH ROW EXECUTE FUNCTION public.fn_deactivate_push_tokens_on_membership_loss();