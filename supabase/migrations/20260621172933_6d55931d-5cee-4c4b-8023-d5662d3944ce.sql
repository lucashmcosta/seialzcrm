
-- 1) Enable RLS on residual backup/log tables (admin-only access)
ALTER TABLE public.contacts_merge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities_status_backup_20260512 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON public.contacts_merge_log;
CREATE POLICY "service_role_full_access" ON public.contacts_merge_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access" ON public.opportunities_status_backup_20260512;
CREATE POLICY "service_role_full_access" ON public.opportunities_status_backup_20260512
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Force SECURITY INVOKER on views that didn't have it set
ALTER VIEW public.best_time_per_contact SET (security_invoker = on);
ALTER VIEW public.vw_marketing_ad_performance SET (security_invoker = on);
ALTER VIEW public.vw_marketing_campaign_summary SET (security_invoker = on);
ALTER VIEW public.vw_marketing_funnel SET (security_invoker = on);
ALTER VIEW public.intelligence_stale_claims_metrics SET (security_invoker = on);
ALTER VIEW public.vw_intel_won_vs_lost_30d SET (security_invoker = on);
ALTER VIEW public.vw_intel_sellers_30d SET (security_invoker = on);

-- 3) Fix marketing_campaigns / spend_history policies: use current_user_id(), not auth.uid()
DROP POLICY IF EXISTS marketing_campaigns_org_isolation ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_org_isolation ON public.marketing_campaigns
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT uo.organization_id FROM public.user_organizations uo
    WHERE uo.user_id = public.current_user_id() AND uo.is_active = true
  ))
  WITH CHECK (organization_id IN (
    SELECT uo.organization_id FROM public.user_organizations uo
    WHERE uo.user_id = public.current_user_id() AND uo.is_active = true
  ));

DROP POLICY IF EXISTS spend_history_org_isolation ON public.marketing_campaign_spend_history;
CREATE POLICY spend_history_org_isolation ON public.marketing_campaign_spend_history
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT uo.organization_id FROM public.user_organizations uo
    WHERE uo.user_id = public.current_user_id() AND uo.is_active = true
  ))
  WITH CHECK (organization_id IN (
    SELECT uo.organization_id FROM public.user_organizations uo
    WHERE uo.user_id = public.current_user_id() AND uo.is_active = true
  ));
