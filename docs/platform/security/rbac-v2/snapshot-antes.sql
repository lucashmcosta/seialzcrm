-- Snapshot ANTES da Etapa 1 (RBAC v2) — capturado em 2026-10-09 do banco vivo.
-- Fonte: pg_get_functiondef / pg_policies. Apenas definições, nenhum dado.

-- ===================== FUNÇÕES =====================
CREATE OR REPLACE FUNCTION public.can_manage_permission_profiles(_organization_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.user_organizations uo ON uo.user_id = u.id AND uo.organization_id = _organization_id AND uo.is_active = true
    LEFT JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE u.auth_user_id = auth.uid()
      AND ( u.is_platform_admin = true
        OR ( uo.id IS NOT NULL AND (
              COALESCE((pp.permissions->>'can_manage_users')::boolean, false)
              OR COALESCE((pp.permissions->>'can_manage_settings')::boolean, false))))
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
      JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
     WHERE uo.user_id = _user_id AND uo.organization_id = _org_id
       AND uo.is_active = true AND lower(pp.name) = lower(_role));
$function$;

-- current_user_id, current_user_org_ids, is_admin_user, user_can_view_all, user_has_org_access:
-- não alteradas pela Etapa 1 (referência apenas).

-- ===================== POLICIES =====================
CREATE POLICY "Users can delete contacts in their org" ON public.contacts FOR DELETE TO public USING (user_has_org_access(organization_id));
CREATE POLICY "Users can insert contacts in their org" ON public.contacts FOR INSERT TO public WITH CHECK (user_has_org_access(organization_id));
CREATE POLICY "Users can update contacts in their org" ON public.contacts FOR UPDATE TO public USING (user_has_org_access(organization_id));
CREATE POLICY "Users can view deleted contacts in trash" ON public.contacts FOR SELECT TO public USING (((organization_id = ANY ((SELECT current_user_org_ids())::uuid[])) AND (deleted_at IS NOT NULL)));
CREATE POLICY "Users can delete opportunities in their org" ON public.opportunities FOR DELETE TO public USING (user_has_org_access(organization_id));
CREATE POLICY "Users can insert opportunities in their org" ON public.opportunities FOR INSERT TO public WITH CHECK (user_has_org_access(organization_id));
CREATE POLICY "Users can update opportunities in their org" ON public.opportunities FOR UPDATE TO public USING (user_has_org_access(organization_id));
CREATE POLICY "Users can view deleted opportunities in trash" ON public.opportunities FOR SELECT TO public USING ((user_has_org_access(organization_id) AND (deleted_at IS NOT NULL)));
CREATE POLICY "Users can update their organizations" ON public.organizations FOR UPDATE TO public USING (user_has_org_access(id));
CREATE POLICY "Managers can manage permission profiles" ON public.permission_profiles FOR ALL TO authenticated USING (can_manage_permission_profiles(organization_id)) WITH CHECK (can_manage_permission_profiles(organization_id));
CREATE POLICY "Users can update their own record" ON public.users FOR UPDATE TO public USING ((auth_user_id = auth.uid()));
CREATE POLICY "Users can view threads in their org" ON public.message_threads FOR SELECT TO authenticated USING ((is_admin_user() OR ((organization_id = ANY (current_user_org_ids())) AND (user_can_view_all(organization_id, 'threads'::text) OR (assigned_user_id = current_user_id()) OR ((assigned_user_id IS NULL) AND user_has_cs_permission(organization_id, 'can_manage_cs_queue'::text))))));
-- Demais policies (activities, calls, tasks, messages, documents, contact_identity_profiles,
-- custom_field_values, user_organizations, users SELECT) inalteradas na Parte A.

-- ===================== VIEWS (todas sem security_invoker) =====================
-- v_entity_sync_status, vw_marketing_ad_performance, vw_marketing_campaign_summary,
-- vw_marketing_funnel, intelligence_stale_claims_metrics, vw_intel_won_vs_lost_30d,
-- vw_meta_media_performance, vw_intel_sellers_30d, best_time_per_contact, vw_journey_timeline
-- Reversão: ALTER VIEW public.<view> SET (security_invoker = false);
