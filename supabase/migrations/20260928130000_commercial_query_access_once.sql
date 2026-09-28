-- Evaluate organization permissions once per query, not once per CRM row.
CREATE OR REPLACE FUNCTION public.commercial_filtered_records(p_org uuid,p_type text,p_filters jsonb DEFAULT '{}')
RETURNS TABLE(record jsonb,created_at timestamptz,entity_id uuid,stage_id uuid,status text,amount numeric,currency text,origin_id uuid,campaign_id uuid,origin_name text,campaign_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH access_data AS MATERIALIZED (
  SELECT current_user_id() user_id,
    commercial_has_permission(p_org,'can_view_contacts') contacts_allowed,
    commercial_has_permission(p_org,'can_view_opportunities') opportunities_allowed,
    user_can_view_all(p_org,'contacts') all_contacts,
    user_can_view_all(p_org,'opportunities') all_opportunities
 ), entities AS (
  SELECT jsonb_build_object('id',c.id,'full_name',c.full_name,'email',c.email,'phone',c.phone,'company_name',c.company_name,'lifecycle_stage',c.lifecycle_stage,'owner_user_id',c.owner_user_id,'created_at',c.created_at) record,
   c.created_at,c.id entity_id,NULL::uuid stage_id,c.lifecycle_stage::text status,0::numeric amount,NULL::text currency,
   c.owner_user_id,c.full_name title,NULL::date close_date
  FROM contacts c CROSS JOIN access_data perm WHERE p_type='contact' AND c.organization_id=p_org AND c.deleted_at IS NULL AND perm.contacts_allowed AND (perm.all_contacts OR c.owner_user_id=perm.user_id)
   AND (COALESCE(p_filters->>'stage','')='' OR c.lifecycle_stage::text=p_filters->>'stage')
   AND (COALESCE(p_filters->>'search','')='' OR c.search_name ILIKE '%'||public.f_unaccent(lower(p_filters->>'search'))||'%'
    OR c.search_email ILIKE '%'||public.f_unaccent(lower(p_filters->>'search'))||'%'
    OR ((p_filters->>'search') ~ '^[0-9[:space:]()+-]+$' AND length(regexp_replace(p_filters->>'search','[^0-9]','','g'))>=4 AND c.phone_digits LIKE '%'||regexp_replace(p_filters->>'search','[^0-9]','','g')||'%'))
  UNION ALL
  SELECT jsonb_build_object('id',o.id,'title',o.title,'amount',o.amount,'currency',o.currency,'status',o.status,'contact_id',o.contact_id,'owner_user_id',o.owner_user_id,'close_date',o.close_date,'created_at',o.created_at,'pipeline_stage_id',o.pipeline_stage_id,'pipeline_stage',ps.name)||jsonb_build_object('contacts',CASE WHEN (perm.contacts_allowed AND c.deleted_at IS NULL AND (perm.all_contacts OR c.owner_user_id=perm.user_id)) THEN jsonb_build_object('full_name',c.full_name) END,
    'users',jsonb_build_object('full_name',u.full_name)),o.created_at,o.id,o.pipeline_stage_id,o.status::text,COALESCE(o.amount,0),o.currency,o.owner_user_id,o.title,o.close_date
  FROM opportunities o LEFT JOIN pipeline_stages ps ON ps.id=o.pipeline_stage_id AND ps.organization_id=o.organization_id LEFT JOIN contacts c ON c.id=o.contact_id AND c.organization_id=o.organization_id LEFT JOIN users u ON u.id=o.owner_user_id CROSS JOIN access_data perm
  WHERE p_type='opportunity' AND o.organization_id=p_org AND o.deleted_at IS NULL AND (perm.opportunities_allowed AND (perm.all_opportunities OR o.owner_user_id=perm.user_id))
   AND (COALESCE(p_filters->>'search','')='' OR o.title ILIKE '%'||(p_filters->>'search')||'%'
     OR ((perm.contacts_allowed AND c.deleted_at IS NULL AND (perm.all_contacts OR c.owner_user_id=perm.user_id)) AND c.full_name ILIKE '%'||(p_filters->>'search')||'%'))
   AND (COALESCE(p_filters->>'min_amount','')='' OR o.amount>=(p_filters->>'min_amount')::numeric)
   AND (COALESCE(p_filters->>'max_amount','')='' OR o.amount<=(p_filters->>'max_amount')::numeric)
   AND (COALESCE(p_filters->>'close_from','')='' OR o.close_date>=(p_filters->>'close_from')::date)
   AND (COALESCE(p_filters->>'close_to','')='' OR o.close_date<=(p_filters->>'close_to')::date)
   AND (NOT COALESCE((p_filters->>'no_close')::boolean,false) OR o.close_date IS NULL)
   AND (COALESCE(jsonb_array_length(p_filters->'stages'),0)=0 OR o.pipeline_stage_id::text IN (SELECT jsonb_array_elements_text(p_filters->'stages')))
   AND (COALESCE(jsonb_array_length(p_filters->'tags'),0)=0 OR EXISTS(SELECT 1 FROM tag_assignments t WHERE t.organization_id=p_org AND t.entity_id=o.id AND t.entity_type='opportunity' AND t.tag_id::text IN (SELECT jsonb_array_elements_text(p_filters->'tags'))))
 )
 SELECT e.record || jsonb_build_object('commercial_origin',CASE WHEN a.id IS NULL THEN NULL ELSE
   jsonb_build_object('origin_id',a.origin_id,'name',COALESCE(s.name,'Não identificada'),'campaign_id',a.campaign_id,
    'campaign_name',COALESCE(m.display_name,m.campaign_name,m.ad_name),'method',a.method,'channel',a.channel,
    'pending',a.pending,'revision',a.revision,'event_id',a.event_id) END),e.created_at,e.entity_id,e.stage_id,e.status,e.amount,e.currency,a.origin_id,a.campaign_id,COALESCE(s.name,'Não identificada'),COALESCE(m.display_name,m.campaign_name,m.ad_name,'Sem campanha')
 FROM entities e LEFT JOIN commercial_attributions a ON a.organization_id=p_org AND a.entity_type=p_type AND a.entity_id=e.entity_id
 LEFT JOIN commercial_origins s ON s.id=a.origin_id AND s.organization_id=p_org
 LEFT JOIN marketing_campaigns m ON m.id=a.campaign_id AND m.organization_id=p_org
 WHERE EXISTS(SELECT 1 FROM commercial_origin_settings WHERE organization_id=p_org AND enabled)
  AND (COALESCE(p_filters->>'origin','')='' OR (p_filters->>'origin'='unknown' AND a.origin_id IS NULL) OR a.origin_id::text=p_filters->>'origin')
  AND (COALESCE(p_filters->>'campaign','')='' OR (p_filters->>'campaign'='none' AND a.campaign_id IS NULL) OR a.campaign_id::text=p_filters->>'campaign')
  AND (COALESCE(p_filters->>'currency','')='' OR e.currency=p_filters->>'currency' OR (p_filters->>'currency'='unknown' AND e.currency IS NULL))
  AND (COALESCE(p_filters->>'method','')='' OR COALESCE(a.method,'unknown')=p_filters->>'method')
  AND (COALESCE(p_filters->>'channel','')='' OR a.channel=p_filters->>'channel')
  AND (NOT COALESCE((p_filters->>'pending')::boolean,false) OR a.pending)
  AND (COALESCE(p_filters->>'from','')='' OR e.created_at>=(p_filters->>'from')::timestamptz)
  AND (COALESCE(p_filters->>'to','')='' OR e.created_at<(p_filters->>'to')::timestamptz)
  AND (COALESCE(p_filters->>'owner','')='' OR (p_filters->>'owner'='none' AND e.owner_user_id IS NULL) OR e.owner_user_id::text=p_filters->>'owner')
  AND (COALESCE(jsonb_array_length(p_filters->'owners'),0)=0 OR e.owner_user_id::text IN (SELECT jsonb_array_elements_text(p_filters->'owners')) OR (e.owner_user_id IS NULL AND p_filters->'owners' ? 'none'));
$$;
REVOKE ALL ON FUNCTION public.commercial_filtered_records(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

