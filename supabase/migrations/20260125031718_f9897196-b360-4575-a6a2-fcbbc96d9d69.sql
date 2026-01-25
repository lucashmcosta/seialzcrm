-- Função para retornar contagens reais por stage (sem limite de 1000)
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
    pipeline_stage_id as stage_id,
    COUNT(*)::BIGINT as opportunity_count,
    COALESCE(SUM(amount), 0) as total_amount
  FROM opportunities
  WHERE organization_id = org_id
    AND status = 'open'
    AND deleted_at IS NULL
  GROUP BY pipeline_stage_id;
$$;