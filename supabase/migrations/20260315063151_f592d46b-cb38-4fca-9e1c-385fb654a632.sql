CREATE OR REPLACE FUNCTION get_opportunity_stage_counts(org_id UUID)
RETURNS TABLE (
  stage_id UUID,
  opportunity_count BIGINT,
  total_amount NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ps.id as stage_id,
    COUNT(o.id)::BIGINT as opportunity_count,
    COALESCE(SUM(o.amount), 0) as total_amount
  FROM pipeline_stages ps
  LEFT JOIN opportunities o 
    ON o.pipeline_stage_id = ps.id
    AND o.organization_id = org_id
    AND o.deleted_at IS NULL
    AND o.status::text = (
      CASE ps.type
        WHEN 'won' THEN 'won'
        WHEN 'lost' THEN 'lost'
        ELSE 'open'
      END
    )
  WHERE ps.organization_id = org_id
  GROUP BY ps.id;
$$;