import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { PencilSimple, Robot } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { uiDateLocale, uiDatePattern, uiText, useUiLocale } from '@/lib/ui-locale';
import { LossCorrectionDialog } from './LossCorrectionDialog';

interface LossRow {
  id: string; reason_id: string | null; detail_id: string | null; reason_code: string | null; detail_code: string | null;
  description: string | null; stage_id_at_loss: string | null; lost_at: string; actor_type: string; actor_user_id: string | null;
  automation_ref: string | null; reopened_at: string | null; reopened_by: string | null;
}
interface CorrectionRow {
  id: string; loss_id: string; old_reason_code: string | null; old_detail_code: string | null; old_description: string | null;
  corrected_by: string | null; corrected_at: string;
}

interface Props {
  opportunityId: string;
  isLost: boolean;
  canCorrect: boolean;
  /** Muda quando a oportunidade muda de status, para recarregar. */
  reloadKey: string;
  onChanged: () => void | Promise<void>;
}

const actorLabel = (type: string) => ({
  automation: uiText('Automação'), agent: uiText('Agente de IA'), api: uiText('API'), system: uiText('Sistema'),
} as Record<string, string>)[type] ?? null;

/** Histórico de perdas da oportunidade: cada perda, reabertura e correção fica registrada. */
export function OpportunityLossHistory({ opportunityId, isLost, canCorrect, reloadKey, onChanged }: Props) {
  useUiLocale();
  const [losses, setLosses] = useState<LossRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [names, setNames] = useState<{ reasons: Map<string, string>; details: Map<string, string>; stages: Map<string, string>; users: Map<string, string> }>(
    { reasons: new Map(), details: new Map(), stages: new Map(), users: new Map() });
  const [correcting, setCorrecting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('opportunity_losses')
      .select('id,reason_id,detail_id,reason_code,detail_code,description,stage_id_at_loss,lost_at,actor_type,actor_user_id,automation_ref,reopened_at,reopened_by')
      .eq('opportunity_id', opportunityId).order('lost_at', { ascending: false });
    const rows = (data ?? []) as LossRow[];
    setLosses(rows);
    if (rows.length === 0) { setCorrections([]); return; }
    const { data: corr } = await supabase.from('opportunity_loss_corrections')
      .select('id,loss_id,old_reason_code,old_detail_code,old_description,corrected_by,corrected_at')
      .in('loss_id', rows.map((r) => r.id)).order('corrected_at', { ascending: false });
    const corrRows = (corr ?? []) as CorrectionRow[];
    setCorrections(corrRows);
    const ids = (list: (string | null)[]) => Array.from(new Set(list.filter((x): x is string => !!x)));
    const reasonIds = ids(rows.map((r) => r.reason_id));
    const detailIds = ids(rows.map((r) => r.detail_id));
    const stageIds = ids(rows.map((r) => r.stage_id_at_loss));
    const userIds = ids([...rows.map((r) => r.actor_user_id), ...rows.map((r) => r.reopened_by), ...corrRows.map((c) => c.corrected_by)]);
    const [rs, ds, ss, us] = await Promise.all([
      reasonIds.length ? supabase.from('opportunity_loss_reasons').select('id,name').in('id', reasonIds) : Promise.resolve({ data: [] }),
      detailIds.length ? supabase.from('opportunity_loss_reason_details').select('id,name').in('id', detailIds) : Promise.resolve({ data: [] }),
      stageIds.length ? supabase.from('pipeline_stages').select('id,name').in('id', stageIds) : Promise.resolve({ data: [] }),
      userIds.length ? supabase.from('users').select('id,full_name').in('id', userIds) : Promise.resolve({ data: [] }),
    ]);
    const toMap = (list: { id: string; name?: string; full_name?: string }[] | null) =>
      new Map((list ?? []).map((x) => [x.id, x.name ?? x.full_name ?? '']));
    setNames({
      reasons: toMap(rs.data as { id: string; name: string }[]),
      details: toMap(ds.data as { id: string; name: string }[]),
      stages: toMap(ss.data as { id: string; name: string }[]),
      users: toMap(us.data as { id: string; full_name: string }[]),
    });
  }, [opportunityId]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const open = losses.find((l) => !l.reopened_at) ?? null;
  const current = useMemo(() => ({
    reasonId: open?.reason_id ?? null, detailId: open?.detail_id ?? null, description: open?.description ?? '',
  }), [open]);

  if (losses.length === 0) return null;
  const when = (iso: string) => format(new Date(iso), uiDatePattern(true), { locale: uiDateLocale() });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{uiText('Histórico de perdas')}</CardTitle>
        {isLost && open && canCorrect && (
          <Button variant="outline" size="sm" onClick={() => setCorrecting(true)}>
            <PencilSimple className="mr-1.5" size={14} />{uiText('Corrigir motivo')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {losses.map((loss) => {
          const reasonName = loss.reason_id ? names.reasons.get(loss.reason_id) : null;
          const detailName = loss.detail_id ? names.details.get(loss.detail_id) : null;
          const actor = actorLabel(loss.actor_type);
          const who = loss.actor_user_id ? names.users.get(loss.actor_user_id) : null;
          const lossCorrections = corrections.filter((c) => c.loss_id === loss.id);
          return (
            <div key={loss.id} className="space-y-1.5 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                {loss.reason_code ? (
                  <>
                    <span className="font-medium">{reasonName ?? loss.reason_code}</span>
                    {loss.detail_code && <span className="text-muted-foreground">› {detailName ?? loss.detail_code}</span>}
                    <span className="font-data text-xs text-muted-foreground">{loss.detail_code ?? loss.reason_code}</span>
                  </>
                ) : <span className="text-muted-foreground">{uiText('Sem motivo informado')}</span>}
                {!loss.reopened_at && <Badge variant="destructive" size="sm">{uiText('Atual')}</Badge>}
                {actor && <Badge variant="info" size="sm" icon={<Robot size={12} />}>{actor}</Badge>}
              </div>
              {loss.description && <p className="whitespace-pre-wrap">{loss.description}</p>}
              <p className="text-xs text-muted-foreground">
                {uiText('Perdida em {0}', { 0: when(loss.lost_at) })}
                {who ? ` · ${uiText('por {0}', { 0: who })}` : loss.automation_ref ? ` · ${loss.automation_ref}` : ''}
                {loss.stage_id_at_loss && names.stages.get(loss.stage_id_at_loss) ? ` · ${uiText('estava em {0}', { 0: names.stages.get(loss.stage_id_at_loss)! })}` : ''}
              </p>
              {loss.reopened_at && (
                <p className="text-xs text-muted-foreground">
                  {uiText('Reaberta em {0}', { 0: when(loss.reopened_at) })}
                  {loss.reopened_by && names.users.get(loss.reopened_by) ? ` · ${uiText('por {0}', { 0: names.users.get(loss.reopened_by)! })}` : ''}
                </p>
              )}
              {lossCorrections.map((c) => (
                <p key={c.id} className="text-xs text-muted-foreground">
                  {uiText('Motivo corrigido em {0}{1}. Antes: {2}', {
                    0: when(c.corrected_at),
                    1: c.corrected_by && names.users.get(c.corrected_by) ? ` ${uiText('por {0}', { 0: names.users.get(c.corrected_by)! })}` : '',
                    2: [c.old_detail_code ?? c.old_reason_code ?? uiText('sem motivo'), c.old_description].filter(Boolean).join(' — '),
                  })}
                </p>
              ))}
            </div>
          );
        })}
      </CardContent>
      {open && (
        <LossCorrectionDialog open={correcting} onOpenChange={setCorrecting} opportunityId={opportunityId}
          current={current} onSuccess={async () => { await load(); await onChanged(); }} />
      )}
    </Card>
  );
}
