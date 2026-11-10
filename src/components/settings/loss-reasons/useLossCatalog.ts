import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_LOSS_SETTINGS,
  type LossDetail,
  type LossReason,
  type LossSettings,
  type StageRuleIssue,
} from '@/lib/lossReasons';

export interface LossStage { id: string; name: string; order_index: number; type: string | null }
export interface LossStageRule { id: string; stage_id: string; detail_id: string }
export interface LossRuleIssue { rule_id: string; stage_id: string; stage_name: string; detail_code: string; detail_name: string; issue: StageRuleIssue }
export interface LossUsage { reasons: Record<string, number>; details: Record<string, number> }

/** Tudo que a tela de configuração de motivos de perda precisa, de uma vez. */
export function useLossCatalog(organizationId: string | undefined, canManage: boolean) {
  const [reasons, setReasons] = useState<LossReason[]>([]);
  const [details, setDetails] = useState<LossDetail[]>([]);
  const [settings, setSettings] = useState<LossSettings>(DEFAULT_LOSS_SETTINGS);
  const [usage, setUsage] = useState<LossUsage>({ reasons: {}, details: {} });
  const [stages, setStages] = useState<LossStage[]>([]);
  const [rules, setRules] = useState<LossStageRule[]>([]);
  const [issues, setIssues] = useState<LossRuleIssue[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!organizationId) return;
    const [r, d, s, u, st, ru, iss] = await Promise.all([
      supabase.from('opportunity_loss_reasons').select('id,code,name,order_index,is_active').eq('organization_id', organizationId).order('order_index'),
      supabase.from('opportunity_loss_reason_details')
        .select('id,reason_id,code,name,help_text,order_index,is_active,requires_description,automation_only')
        .eq('organization_id', organizationId).order('order_index'),
      supabase.from('opportunity_loss_settings').select('reason_required,detail_mode').eq('organization_id', organizationId).maybeSingle(),
      supabase.rpc('loss_reason_usage_v1', { _organization_id: organizationId }),
      supabase.from('pipeline_stages').select('id,name,order_index,type').eq('organization_id', organizationId).order('order_index'),
      supabase.from('opportunity_loss_stage_rules').select('id,stage_id,detail_id').eq('organization_id', organizationId),
      canManage
        ? supabase.rpc('list_loss_stage_rule_issues_v1', { _organization_id: organizationId })
        : Promise.resolve({ data: [], error: null }),
    ]);
    setReasons((r.data ?? []) as LossReason[]);
    setDetails((d.data ?? []) as LossDetail[]);
    setSettings(s.data ? (s.data as LossSettings) : DEFAULT_LOSS_SETTINGS);
    setUsage((u.data as unknown as LossUsage | null) ?? { reasons: {}, details: {} });
    setStages((st.data ?? []) as LossStage[]);
    setRules((ru.data ?? []) as LossStageRule[]);
    setIssues(((iss.data as unknown) ?? []) as LossRuleIssue[]);
  }, [organizationId, canManage]);

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [reload]);

  return { reasons, details, settings, usage, stages, rules, issues, loading, reload };
}
