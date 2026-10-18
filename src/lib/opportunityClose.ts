import { supabase } from '@/integrations/supabase/client';

export type ClosePolicyMode = 'off' | 'monitor' | 'enforce';

export interface OpportunityCloseItem {
  code: string;
  label: string;
  status: 'passed' | 'warning' | 'missing';
  action?: 'edit_contact' | 'edit_opportunity' | 'edit_documents' | 'classify';
  document_type_id?: string; // 1º tipo (compat); veja document_type_ids p/ grupos
  document_type_ids?: string[]; // alternativas do grupo (anyOf); single = 1 elemento
  owner_type?: 'contact' | 'opportunity';
  fallback?: boolean;
}

/** Classificação de processos: item que bloqueia o ganho em qualquer modo e não aceita override. */
export const CLASSIFICATION_ITEM = 'process_classification';
export const CLASSIFICATION_REQUIRED_MSG = 'Classifique o processo antes de marcar como ganha.';
export const classificationMissing = (e?: Pick<OpportunityCloseEvaluation, 'items'> | null) =>
  !!e?.items.some((i) => i.code === CLASSIFICATION_ITEM && i.status === 'missing');
/** Pendências que seguem a política de fechamento (monitor/enforce), sem a classificação. */
export const policyMissingCount = (e: Pick<OpportunityCloseEvaluation, 'items'>) =>
  e.items.filter((i) => i.status === 'missing' && i.code !== CLASSIFICATION_ITEM).length;
/** Mensagem para erros de banco ao mover para ganha (trigger trg_guard_won_requires_classification). */
export const isClassificationRequiredError = (err: { message?: string } | null | undefined) =>
  !!err?.message?.includes('classification_required');

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
