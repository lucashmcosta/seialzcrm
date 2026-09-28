-- New RPCs only; existing marketing and CRM RPC signatures are untouched.
CREATE FUNCTION public.commercial_entity_origin(p_org uuid,p_type text,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('origin_id',a.origin_id,'name',COALESCE(s.name,'Não identificada'),'campaign_id',a.campaign_id,
 'campaign_name',COALESCE(m.display_name,m.campaign_name,m.ad_name),'method',a.method,'channel',a.channel,'pending',a.pending,'revision',a.revision,'event_id',a.event_id)
 FROM commercial_attributions a LEFT JOIN commercial_origins s ON s.id=a.origin_id AND s.organization_id=a.organization_id
 LEFT JOIN marketing_campaigns m ON m.id=a.campaign_id AND m.organization_id=a.organization_id
 WHERE a.organization_id=p_org AND a.entity_type=p_type AND a.entity_id=p_id;
$$;
REVOKE ALL ON FUNCTION public.commercial_entity_origin(uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.commercial_filtered_records(p_org uuid,p_type text,p_filters jsonb DEFAULT '{}')
RETURNS TABLE(record jsonb,created_at timestamptz,entity_id uuid,stage_id uuid,status text,amount numeric,currency text,origin_id uuid,campaign_id uuid,origin_name text,campaign_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH entities AS (
  SELECT jsonb_build_object('id',c.id,'full_name',c.full_name,'email',c.email,'phone',c.phone,'company_name',c.company_name,'lifecycle_stage',c.lifecycle_stage,'owner_user_id',c.owner_user_id,'created_at',c.created_at)||jsonb_build_object('commercial_origin',commercial_entity_origin(p_org,'contact',c.id)) record,
   c.created_at,c.id entity_id,NULL::uuid stage_id,c.lifecycle_stage::text status,0::numeric amount,NULL::text currency,
   c.owner_user_id,c.full_name title,NULL::date close_date
  FROM contacts c WHERE p_type='contact' AND c.organization_id=p_org AND c.deleted_at IS NULL AND commercial_can_read(p_org,'contact',c.id)
   AND (COALESCE(p_filters->>'stage','')='' OR c.lifecycle_stage::text=p_filters->>'stage')
   AND (COALESCE(p_filters->>'search','')='' OR c.search_name ILIKE '%'||public.f_unaccent(lower(p_filters->>'search'))||'%'
    OR c.search_email ILIKE '%'||public.f_unaccent(lower(p_filters->>'search'))||'%'
    OR ((p_filters->>'search') ~ '^[0-9[:space:]()+-]+$' AND length(regexp_replace(p_filters->>'search','[^0-9]','','g'))>=4 AND c.phone_digits LIKE '%'||regexp_replace(p_filters->>'search','[^0-9]','','g')||'%'))
  UNION ALL
  SELECT jsonb_build_object('id',o.id,'title',o.title,'amount',o.amount,'currency',o.currency,'status',o.status,'contact_id',o.contact_id,'owner_user_id',o.owner_user_id,'close_date',o.close_date,'created_at',o.created_at,'pipeline_stage_id',o.pipeline_stage_id,'pipeline_stage',ps.name)||jsonb_build_object('commercial_origin',commercial_entity_origin(p_org,'opportunity',o.id),
    'contacts',CASE WHEN commercial_can_read(p_org,'contact',c.id) THEN jsonb_build_object('full_name',c.full_name) END,
    'users',jsonb_build_object('full_name',u.full_name)),o.created_at,o.id,o.pipeline_stage_id,o.status::text,COALESCE(o.amount,0),o.currency,o.owner_user_id,o.title,o.close_date
  FROM opportunities o LEFT JOIN pipeline_stages ps ON ps.id=o.pipeline_stage_id AND ps.organization_id=o.organization_id LEFT JOIN contacts c ON c.id=o.contact_id AND c.organization_id=o.organization_id LEFT JOIN users u ON u.id=o.owner_user_id
  WHERE p_type='opportunity' AND o.organization_id=p_org AND o.deleted_at IS NULL AND commercial_can_read(p_org,'opportunity',o.id)
   AND (COALESCE(p_filters->>'search','')='' OR o.title ILIKE '%'||(p_filters->>'search')||'%'
     OR (commercial_can_read(p_org,'contact',c.id) AND c.full_name ILIKE '%'||(p_filters->>'search')||'%'))
   AND (COALESCE(p_filters->>'min_amount','')='' OR o.amount>=(p_filters->>'min_amount')::numeric)
   AND (COALESCE(p_filters->>'max_amount','')='' OR o.amount<=(p_filters->>'max_amount')::numeric)
   AND (COALESCE(p_filters->>'close_from','')='' OR o.close_date>=(p_filters->>'close_from')::date)
   AND (COALESCE(p_filters->>'close_to','')='' OR o.close_date<=(p_filters->>'close_to')::date)
   AND (NOT COALESCE((p_filters->>'no_close')::boolean,false) OR o.close_date IS NULL)
   AND (COALESCE(jsonb_array_length(p_filters->'stages'),0)=0 OR o.pipeline_stage_id::text IN (SELECT jsonb_array_elements_text(p_filters->'stages')))
   AND (COALESCE(jsonb_array_length(p_filters->'tags'),0)=0 OR EXISTS(SELECT 1 FROM tag_assignments t WHERE t.organization_id=p_org AND t.entity_id=o.id AND t.entity_type='opportunity' AND t.tag_id::text IN (SELECT jsonb_array_elements_text(p_filters->'tags'))))
 )
 SELECT e.record,e.created_at,e.entity_id,e.stage_id,e.status,e.amount,e.currency,a.origin_id,a.campaign_id,COALESCE(s.name,'Não identificada'),COALESCE(m.display_name,m.campaign_name,m.ad_name,'Sem campanha')
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

CREATE FUNCTION public.commercial_records(p_org uuid,p_type text,p_filters jsonb DEFAULT '{}',p_limit integer DEFAULT 25,p_offset integer DEFAULT 0,p_grouped boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 IF p_type NOT IN ('contact','opportunity') OR NOT commercial_has_permission(p_org,CASE p_type WHEN 'contact' THEN 'can_view_contacts' ELSE 'can_view_opportunities' END) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 WITH filtered AS MATERIALIZED (SELECT * FROM commercial_filtered_records(p_org,p_type,p_filters)), numbered AS (
 SELECT *,row_number() OVER(PARTITION BY stage_id ORDER BY created_at DESC,entity_id) rn FROM filtered), stages AS (
 SELECT s.id stage_id,s.name stage_name,s.type stage_type,s.order_index,count(f.entity_id) opportunity_count,COALESCE(sum(f.amount),0) total_amount,
  COALESCE((SELECT jsonb_agg(n.record ORDER BY n.created_at DESC,n.entity_id) FROM numbered n WHERE n.stage_id=s.id AND n.rn>GREATEST(p_offset,0) AND n.rn<=GREATEST(p_offset,0)+LEAST(GREATEST(p_limit,1),100)),'[]') opportunities
 FROM pipeline_stages s LEFT JOIN filtered f ON f.stage_id=s.id WHERE s.organization_id=p_org GROUP BY s.id,s.name,s.type,s.order_index)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),
  'items',COALESCE((SELECT jsonb_agg(x.record) FROM (SELECT record FROM filtered
   ORDER BY CASE WHEN p_filters->>'sort'='amount' AND p_filters->>'sort_direction'='ascending' THEN amount END ASC,
     CASE WHEN p_filters->>'sort'='amount' AND p_filters->>'sort_direction'='descending' THEN amount END DESC,
     CASE WHEN p_filters->>'sort'<>'amount' AND p_filters->>'sort_direction'='ascending' THEN CASE p_filters->>'sort' WHEN 'contact' THEN record#>>'{contacts,full_name}' WHEN 'owner' THEN record#>>'{users,full_name}' ELSE record->>(p_filters->>'sort') END END ASC,
     CASE WHEN p_filters->>'sort'<>'amount' AND p_filters->>'sort_direction'='descending' THEN CASE p_filters->>'sort' WHEN 'contact' THEN record#>>'{contacts,full_name}' WHEN 'owner' THEN record#>>'{users,full_name}' ELSE record->>(p_filters->>'sort') END END DESC,created_at DESC,entity_id
   LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0)) x),'[]'),
  'stages',CASE WHEN p_grouped THEN COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.order_index) FROM stages s),'[]') ELSE '[]'::jsonb END) INTO r;
 RETURN r;
END $$;
CREATE FUNCTION public.commercial_report(p_org uuid,p_filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 IF NOT commercial_has_permission(p_org,'can_view_opportunities') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 WITH opps AS MATERIALIZED (SELECT * FROM commercial_filtered_records(p_org,'opportunity',p_filters)), contacts_data AS MATERIALIZED (SELECT * FROM commercial_filtered_records(p_org,'contact',p_filters)), groups AS (
 SELECT origin_id,campaign_id,origin_name,campaign_name,currency,count(*) created,count(*) FILTER(WHERE status='open') open,
 count(*) FILTER(WHERE status='won') won,count(*) FILTER(WHERE status='lost') lost,
 COALESCE(sum(amount) FILTER(WHERE status='open'),0) open_value,COALESCE(sum(amount) FILTER(WHERE status='won'),0) won_value
 FROM opps GROUP BY origin_id,campaign_id,origin_name,campaign_name,currency)
 SELECT jsonb_build_object('opportunities',(SELECT count(*) FROM opps),'unidentified',(SELECT count(*) FROM opps WHERE origin_id IS NULL),
 'contacts',(SELECT count(*) FROM contacts_data),
 'contact_groups',COALESCE((SELECT jsonb_agg(x) FROM (SELECT origin_id,campaign_id,origin_name,campaign_name,count(*) contacts FROM contacts_data GROUP BY origin_id,campaign_id,origin_name,campaign_name) x),'[]'),
 'groups',COALESCE((SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('conversion',CASE WHEN created>0 THEN round(won*100.0/created,1) ELSE 0 END) ORDER BY created DESC) FROM groups g),'[]')) INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.commercial_records(uuid,text,jsonb,integer,integer,boolean),public.commercial_report(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commercial_records(uuid,text,jsonb,integer,integer,boolean),public.commercial_report(uuid,jsonb) TO authenticated;
