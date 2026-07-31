import { supabase } from '@/integrations/supabase/client';

export type ClosePolicyMode = 'off' | 'monitor' | 'enforce';

export interface OpportunityCloseItem {
  code: string;
  label: string;
  status: 'passed' | 'warning' | 'missing';
  action?: 'edit_contact' | 'edit_opportunity';
  fallback?: boolean;
}

export interface OpportunityCloseEvaluation {
  organization_id: string;
  opportunity_id: string;
  contact_id: string | null;
  mode: ClosePolicyMode;
  policy_version: number;
  items: OpportunityCloseItem[];
  missing_codes: string[];
  missing_count: number;
  fallback_used: boolean;
  can_close: boolean;
  override_allowed?: boolean;
  ok?: boolean;
  error?: string;
}

export async function evaluateOpportunityClose(organizationId: string, opportunityId: string) {
  const { data, error } = await supabase.rpc('evaluate_opportunity_close_v1', {
    _organization_id: organizationId,
    _opportunity_id: opportunityId,
  });
  if (error) throw error;
  return data as unknown as OpportunityCloseEvaluation;
}

export async function transitionOpportunityStage(input: {
  organizationId: string;
  opportunityId: string;
  targetStageId: string;
  closeDate: string;
  override?: boolean;
  overrideReason?: string;
  source: string;
}) {
  const { data, error } = await supabase.rpc('transition_opportunity_stage_v1', {
    _organization_id: input.organizationId,
    _opportunity_id: input.opportunityId,
    _target_stage_id: input.targetStageId,
    _close_date: input.closeDate,
    _override: input.override ?? false,
    _override_reason: input.overrideReason ?? '',
    _source: input.source,
  });
  if (error) throw error;
  return data as unknown as OpportunityCloseEvaluation & { ok: boolean; status?: string };
}
