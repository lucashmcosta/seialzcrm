import { useState } from 'react';
import { Robot, SpinnerGap, Warning } from '@phosphor-icons/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { lossErrorMessage, stageRuleDetailOptions, stageRuleIssueText, type LossDetail, type LossReason } from '@/lib/lossReasons';
import type { LossRuleIssue, LossStage, LossStageRule } from './useLossCatalog';

const NO_RULE = '__none__';

interface Props {
  organizationId: string;
  canManage: boolean;
  stages: LossStage[];
  rules: LossStageRule[];
  issues: LossRuleIssue[];
  reasons: LossReason[];
  details: LossDetail[];
  onChanged: () => void | Promise<void>;
}

/**
 * Regra por etapa: qual detalhe a automação grava quando a oportunidade para naquela etapa sem resposta.
 * Esta tela só configura; quem executa é a automação.
 */
export function LossStageRulesCard({ organizationId, canManage, stages, rules, issues, reasons, details, onChanged }: Props) {
  useUiLocale();
  const [savingStage, setSavingStage] = useState<string | null>(null);
  const openStages = stages.filter((s) => (s.type ?? 'custom') === 'custom');
  const groups = stageRuleDetailOptions(reasons, details);
  const detailById = new Map(details.map((d) => [d.id, d]));

  const change = async (stageId: string, value: string) => {
    const current = rules.find((r) => r.stage_id === stageId);
    setSavingStage(stageId);
    const { error } = value === NO_RULE
      ? current ? await supabase.from('opportunity_loss_stage_rules').delete().eq('id', current.id) : { error: null }
      : current
        ? await supabase.from('opportunity_loss_stage_rules').update({ detail_id: value }).eq('id', current.id)
        : await supabase.from('opportunity_loss_stage_rules').insert({ organization_id: organizationId, stage_id: stageId, detail_id: value });
    setSavingStage(null);
    if (error) {
      toast({ title: uiText('Não foi possível salvar a regra'), description: lossErrorMessage(error) ?? undefined, variant: 'destructive' });
      return;
    }
    await onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiText('Regras por etapa')}</CardTitle>
        <CardDescription>
          {uiText('Qual detalhe é gravado quando a oportunidade para em cada etapa sem resposta. Etapa sem regra não gera perda automática.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {issues.length > 0 && (
          <Alert variant="destructive">
            <Warning className="h-4 w-4" />
            <AlertTitle>{uiText('Regras que deixaram de gerar perda')}</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                {issues.map((i) => (
                  <li key={i.rule_id}>
                    {uiText('{0}: {1} ({2})', { 0: i.stage_name, 1: `${i.detail_code} · ${i.detail_name}`, 2: stageRuleIssueText(i.issue) })}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {openStages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{uiText('O funil não tem etapas abertas.')}</p>
        ) : groups.length === 0 && rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{uiText('Cadastre um detalhe ativo para configurar as regras por etapa.')}</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {openStages.map((stage) => {
              const rule = rules.find((r) => r.stage_id === stage.id);
              const ruleDetail = rule ? detailById.get(rule.detail_id) : undefined;
              const pending = rule && issues.some((i) => i.rule_id === rule.id);
              return (
                <div key={stage.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium">{stage.name}</span>
                  <div className="flex items-center gap-2 sm:w-[360px]">
                    {savingStage === stage.id && <SpinnerGap className="animate-spin text-muted-foreground" size={16} />}
                    <Select value={rule?.detail_id ?? NO_RULE} disabled={!canManage || savingStage === stage.id}
                      onValueChange={(v) => void change(stage.id, v)}>
                      <SelectTrigger className={pending ? 'border-destructive' : undefined}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_RULE}>{uiText('Sem regra')}</SelectItem>
                        {/* regra pendente aponta para detalhe inativo: continua visível para poder trocar */}
                        {ruleDetail && pending && (
                          <SelectItem value={ruleDetail.id} disabled>{`${ruleDetail.code} · ${ruleDetail.name} (${uiText('inativo')})`}</SelectItem>
                        )}
                        {groups.map((g) => (
                          <SelectGroup key={g.reason.id}>
                            <SelectLabel>{`${g.reason.code} · ${g.reason.name}`}</SelectLabel>
                            {g.details.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                <span className="flex items-center gap-1.5">
                                  <span className="font-data">{d.code}</span> {d.name}
                                  {d.automation_only && <Robot size={14} weight="light" className="text-muted-foreground" />}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
