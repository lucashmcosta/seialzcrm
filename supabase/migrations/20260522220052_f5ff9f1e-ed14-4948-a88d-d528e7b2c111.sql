CREATE OR REPLACE FUNCTION public.get_meta_credentials(p_org_id uuid)
 RETURNS TABLE(source text, is_connected boolean, system_user_token_encrypted text, meta_user_id text, meta_user_name text, business_id text, ad_account_id text, page_id text, pixel_id text, whatsapp_business_account_id text, feature_lead_ads_sync boolean, feature_ads_manager_sync boolean, feature_capi_send_events boolean, send_lead_events boolean, send_purchase_events boolean, last_token_check_at timestamp with time zone, last_token_check_error text, raw_connected_account jsonb, raw_config_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_meta_oi record;
  v_lead_oi record;
  v_capi_oi record;
BEGIN
  SELECT oi.*, ai.slug AS slug
  INTO v_meta_oi
  FROM public.organization_integrations oi
  JOIN public.admin_integrations ai ON ai.id = oi.integration_id
  WHERE oi.organization_id = p_org_id
    AND ai.slug = 'meta'
    AND oi.is_enabled IS TRUE
  LIMIT 1;

  SELECT oi.* INTO v_lead_oi
  FROM public.organization_integrations oi
  JOIN public.admin_integrations ai ON ai.id = oi.integration_id
  WHERE oi.organization_id = p_org_id
    AND ai.slug = 'meta-lead-ads'
    AND oi.is_enabled IS TRUE
  LIMIT 1;

  SELECT oi.* INTO v_capi_oi
  FROM public.organization_integrations oi
  JOIN public.admin_integrations ai ON ai.id = oi.integration_id
  WHERE oi.organization_id = p_org_id
    AND ai.slug = 'meta-capi'
    AND oi.is_enabled IS TRUE
  LIMIT 1;

  IF v_meta_oi.id IS NOT NULL THEN
    RETURN QUERY SELECT
      CASE
        WHEN v_lead_oi.id IS NOT NULL OR v_capi_oi.id IS NOT NULL THEN 'meta_merged'::text
        ELSE 'meta'::text
      END AS source,
      true AS is_connected,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'system_user_token_encrypted', ''),
        NULLIF(v_lead_oi.connected_account->>'system_user_token_encrypted', ''),
        NULLIF(v_capi_oi.connected_account->>'access_token_encrypted', '')
      ) AS system_user_token_encrypted,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'meta_user_id', ''),
        NULLIF(v_lead_oi.connected_account->>'meta_user_id', ''),
        NULLIF(v_capi_oi.connected_account->>'meta_user_id', '')
      ) AS meta_user_id,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'meta_user_name', ''),
        NULLIF(v_lead_oi.connected_account->>'meta_user_name', ''),
        NULLIF(v_capi_oi.connected_account->>'meta_user_name', '')
      ) AS meta_user_name,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'business_id', ''),
        NULLIF(v_meta_oi.config_values->>'business_id', ''),
        NULLIF(v_lead_oi.connected_account->>'business_id', ''),
        NULLIF(v_lead_oi.config_values->>'business_id', ''),
        NULLIF(v_capi_oi.connected_account->>'business_id', ''),
        NULLIF(v_capi_oi.config_values->>'business_id', '')
      ) AS business_id,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'ad_account_id', ''),
        NULLIF(v_meta_oi.config_values->>'ad_account_id', ''),
        NULLIF(v_lead_oi.connected_account->>'ad_account_id', ''),
        NULLIF(v_lead_oi.config_values->>'ad_account_id', ''),
        NULLIF(v_capi_oi.connected_account->>'ad_account_id', ''),
        NULLIF(v_capi_oi.config_values->>'ad_account_id', '')
      ) AS ad_account_id,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'page_id', ''),
        NULLIF(v_meta_oi.config_values->>'page_id', ''),
        NULLIF(v_capi_oi.connected_account->>'page_id', ''),
        NULLIF(v_capi_oi.config_values->>'page_id', ''),
        NULLIF(v_lead_oi.connected_account->>'page_id', ''),
        NULLIF(v_lead_oi.config_values->>'page_id', '')
      ) AS page_id,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'pixel_id', ''),
        NULLIF(v_meta_oi.config_values->>'pixel_id', ''),
        NULLIF(v_capi_oi.connected_account->>'pixel_id', ''),
        NULLIF(v_capi_oi.config_values->>'pixel_id', '')
      ) AS pixel_id,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'whatsapp_business_account_id', ''),
        NULLIF(v_meta_oi.config_values->>'whatsapp_business_account_id', ''),
        NULLIF(v_capi_oi.connected_account->>'whatsapp_business_account_id', ''),
        NULLIF(v_capi_oi.config_values->>'whatsapp_business_account_id', '')
      ) AS whatsapp_business_account_id,
      CASE
        WHEN v_meta_oi.config_values ? 'feature_lead_ads_sync' THEN COALESCE((v_meta_oi.config_values->>'feature_lead_ads_sync')::boolean, true)
        ELSE v_lead_oi.id IS NOT NULL
      END AS feature_lead_ads_sync,
      CASE
        WHEN v_meta_oi.config_values ? 'feature_ads_manager_sync' THEN COALESCE((v_meta_oi.config_values->>'feature_ads_manager_sync')::boolean, true)
        ELSE COALESCE(
          NULLIF(v_meta_oi.connected_account->>'ad_account_id', ''),
          NULLIF(v_meta_oi.config_values->>'ad_account_id', ''),
          NULLIF(v_lead_oi.connected_account->>'ad_account_id', ''),
          NULLIF(v_lead_oi.config_values->>'ad_account_id', ''),
          NULLIF(v_capi_oi.connected_account->>'ad_account_id', ''),
          NULLIF(v_capi_oi.config_values->>'ad_account_id', '')
        ) IS NOT NULL
      END AS feature_ads_manager_sync,
      CASE
        WHEN v_meta_oi.config_values ? 'feature_capi_send_events' THEN COALESCE((v_meta_oi.config_values->>'feature_capi_send_events')::boolean, true)
        ELSE v_capi_oi.id IS NOT NULL
      END AS feature_capi_send_events,
      COALESCE(
        (v_meta_oi.config_values->>'send_lead_events')::boolean,
        (v_capi_oi.config_values->>'send_lead_events')::boolean,
        true
      ) AS send_lead_events,
      COALESCE(
        (v_meta_oi.config_values->>'send_purchase_events')::boolean,
        (v_capi_oi.config_values->>'send_purchase_events')::boolean,
        true
      ) AS send_purchase_events,
      (
        SELECT max(ts)
        FROM (VALUES
          ((v_meta_oi.connected_account->>'last_token_check_at')::timestamptz),
          ((v_lead_oi.connected_account->>'last_token_check_at')::timestamptz),
          ((v_capi_oi.connected_account->>'last_token_check_at')::timestamptz)
        ) AS t(ts)
      ) AS last_token_check_at,
      COALESCE(
        NULLIF(v_meta_oi.connected_account->>'last_token_check_error', ''),
        NULLIF(v_lead_oi.connected_account->>'last_token_check_error', ''),
        NULLIF(v_capi_oi.connected_account->>'last_token_check_error', '')
      ) AS last_token_check_error,
      COALESCE(v_meta_oi.connected_account, '{}'::jsonb)
        || COALESCE(v_lead_oi.connected_account, '{}'::jsonb)
        || COALESCE(v_capi_oi.connected_account, '{}'::jsonb) AS raw_connected_account,
      COALESCE(v_meta_oi.config_values, '{}'::jsonb)
        || COALESCE(v_lead_oi.config_values, '{}'::jsonb)
        || COALESCE(v_capi_oi.config_values, '{}'::jsonb) AS raw_config_values;
    RETURN;
  END IF;

  IF v_lead_oi.id IS NULL AND v_capi_oi.id IS NULL THEN
    RETURN QUERY SELECT
      NULL::text, false,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      false, false, false, false, false,
      NULL::timestamptz, NULL::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'legacy_merged'::text AS source,
    true AS is_connected,
    COALESCE(
      NULLIF(v_lead_oi.connected_account->>'system_user_token_encrypted', ''),
      NULLIF(v_capi_oi.connected_account->>'access_token_encrypted', '')
    ),
    COALESCE(
      NULLIF(v_lead_oi.connected_account->>'meta_user_id', ''),
      NULLIF(v_capi_oi.connected_account->>'meta_user_id', '')
    ),
    COALESCE(
      NULLIF(v_lead_oi.connected_account->>'meta_user_name', ''),
      NULLIF(v_capi_oi.connected_account->>'meta_user_name', '')
    ),
    COALESCE(
      NULLIF(v_lead_oi.connected_account->>'business_id', ''),
      NULLIF(v_capi_oi.connected_account->>'business_id', '')
    ),
    COALESCE(
      NULLIF(v_lead_oi.connected_account->>'ad_account_id', ''),
      NULLIF(v_capi_oi.connected_account->>'ad_account_id', '')
    ),
    COALESCE(
      NULLIF(v_capi_oi.connected_account->>'page_id', ''),
      NULLIF(v_lead_oi.connected_account->>'page_id', '')
    ),
    NULLIF(v_capi_oi.connected_account->>'pixel_id', ''),
    NULLIF(v_capi_oi.connected_account->>'whatsapp_business_account_id', ''),
    (v_lead_oi.id IS NOT NULL) AS feature_lead_ads_sync,
    (v_lead_oi.id IS NOT NULL AND COALESCE(NULLIF(v_lead_oi.connected_account->>'ad_account_id', ''), NULLIF(v_capi_oi.connected_account->>'ad_account_id', '')) IS NOT NULL) AS feature_ads_manager_sync,
    (v_capi_oi.id IS NOT NULL) AS feature_capi_send_events,
    COALESCE((v_capi_oi.config_values->>'send_lead_events')::boolean, true),
    COALESCE((v_capi_oi.config_values->>'send_purchase_events')::boolean, true),
    (
      SELECT max(ts)
      FROM (VALUES
        ((v_lead_oi.connected_account->>'last_token_check_at')::timestamptz),
        ((v_capi_oi.connected_account->>'last_token_check_at')::timestamptz)
      ) AS t(ts)
    ) AS last_token_check_at,
    COALESCE(
      NULLIF(v_lead_oi.connected_account->>'last_token_check_error', ''),
      NULLIF(v_capi_oi.connected_account->>'last_token_check_error', '')
    ),
    COALESCE(v_lead_oi.connected_account, '{}'::jsonb) || COALESCE(v_capi_oi.connected_account, '{}'::jsonb),
    COALESCE(v_lead_oi.config_values, '{}'::jsonb) || COALESCE(v_capi_oi.config_values, '{}'::jsonb);
END;
$function$;