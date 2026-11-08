// Oportunidades abertas do contato na Ficha lateral do Comercial (Fase 2).
// Ganho / Perdido / Mover etapa NÃO têm lógica aqui: chamam os mesmos callbacks do
// menu ⋯ do MessagesList, que abrem os diálogos existentes (política de fechamento,
// documentos exigidos, data de fechamento, bloqueio por pedido de correção).
// Aqui só se edita valor e responsável (update direto, igual ao OpportunityDialog).
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { uiDateLocale, uiDatePattern } from '@/lib/ui-locale';
import { TrendUp, TrendDown, ArrowsLeftRight, Plus } from '@phosphor-icons/react';
import { OpportunityDialog } from '@/components/opportunities/OpportunityDialog';
import { OpportunityReadinessCard } from '@/components/opportunities/OpportunityReadinessCard';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { OwnerSelector } from '@/components/common/OwnerSelector';
import { CustomFieldsCard } from '@/components/custom-fields/CustomFieldsCard';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { ContractSignatureEntry } from '@/components/signature/ContractSignatureEntry';

export type FichaOpp = {
  id: string;
  title: string;
  pipeline_stage_id: string;
  amount?: number | null;
  currency?: string | null;
  owner_user_id?: string | null;
};

export function OpportunitySection({
  contactId,
  opportunities,
  stages,
  canEdit,
  onWon,
  onLost,
  onMoveStage,
  onUpdated,
  onCreated,
  onEditContact,
  onOpenDocuments,
  reloadKey,
}: {
  onEditContact: () => void;
  onOpenDocuments: (opportunityId: string) => void;
  reloadKey: number;
  contactId: string;
  opportunities: FichaOpp[];
  stages: Array<{ id: string; name: string; type?: string | null }>;
  onCreated: () => void;
  canEdit: boolean;
  onWon: (opp: FichaOpp) => void;
  onLost: (opp: FichaOpp) => void;
  onMoveStage: (opp: FichaOpp) => void;
  onUpdated: (id: string, patch: Partial<FichaOpp>) => void;
}) {
  useUiLocale();
  const { organization } = useOrganization();
  const [createOpen, setCreateOpen] = useState(false);
  // Criação: mesmo formulário da tela do contato (OpportunityDialog), com o contato
  // já preenchido; só etapas abertas (ganho/perdido seguem pelos diálogos de fechamento).
  const openStages = useMemo(
    () => stages.filter((s) => s.type !== 'won' && s.type !== 'lost').map((s) => ({ id: s.id, name: s.name, type: s.type ?? undefined })),
    [stages],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{uiText('Oportunidades')}</h3>
        {canEdit && openStages.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />{uiText('Nova')}
          </Button>
        )}
      </div>
      {createOpen && (
        <OpportunityDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          stages={openStages}
          opportunity={{ title: '', amount: 0, currency: organization?.default_currency || 'BRL', contact_id: contactId, pipeline_stage_id: openStages[0]?.id || '', close_date: null }}
          onSuccess={() => { setCreateOpen(false); onCreated(); }}
        />
      )}
      {opportunities.length === 0 ? (
        <p className="text-xs text-muted-foreground">{uiText('Nenhuma oportunidade aberta para este contato.')}</p>
      ) : (
        opportunities.map((opp) => (
          <OpportunityCard
            key={opp.id}
            opp={opp}
            contactId={contactId}
            stageName={stages.find((s) => s.id === opp.pipeline_stage_id)?.name ?? '—'}
            canEdit={canEdit}
            onWon={() => onWon(opp)}
            onLost={() => onLost(opp)}
            onMoveStage={() => onMoveStage(opp)}
            onUpdated={(patch) => onUpdated(opp.id, patch)}
            onEditContact={onEditContact}
            onOpenDocuments={() => onOpenDocuments(opp.id)}
            reloadKey={reloadKey}
          />
        ))
      )}
      <ClosedOpportunities contactId={contactId} reloadKey={`${reloadKey}-${opportunities.length}`} onOpenDocuments={onOpenDocuments} />
    </section>
  );
}

function OpportunityCard({
  opp,
  contactId,
  stageName,
  canEdit,
  onWon,
  onLost,
  onMoveStage,
  onUpdated,
  onEditContact,
  onOpenDocuments,
  reloadKey,
}: {
  onEditContact: () => void;
  onOpenDocuments: () => void;
  reloadKey: number;
  opp: FichaOpp;
  contactId: string;
  stageName: string;
  canEdit: boolean;
  onWon: () => void;
  onLost: () => void;
  onMoveStage: () => void;
  onUpdated: (patch: Partial<FichaOpp>) => void;
}) {
  const { organization, userProfile } = useOrganization();
  const [amount, setAmount] = useState(opp.amount == null ? '' : String(opp.amount));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setAmount(opp.amount == null ? '' : String(opp.amount)); }, [opp.amount]);

  const save = async (patch: Partial<FichaOpp>) => {
    setSaving(true);
    const { error } = await supabase
      .from('opportunities')
      .update({ ...patch, updated_by: userProfile?.id || null } as never)
      .eq('id', opp.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || uiText('Não foi possível salvar a oportunidade.'));
      setAmount(opp.amount == null ? '' : String(opp.amount));
      return;
    }
    onUpdated(patch);
    toast.success(uiText('Oportunidade atualizada'));
  };

  const commitAmount = () => {
    const raw = amount.trim().replace(',', '.');
    const value = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      toast.error(uiText('Valor inválido.'));
      setAmount(opp.amount == null ? '' : String(opp.amount));
      return;
    }
    if (value === Number(opp.amount ?? 0)) return;
    void save({ amount: value });
  };

  const currency = opp.currency || organization?.default_currency || 'BRL';

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate" title={opp.title}>{opp.title}</p>
        <p className="text-xs text-muted-foreground">
          {uiText('Etapa')}: <span className="text-foreground">{stageName}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`ficha-amount-${opp.id}`} className="text-xs text-muted-foreground">
          {uiText('Valor')} ({currency})
        </Label>
        <Input
          id={`ficha-amount-${opp.id}`}
          type="number"
          min={0}
          step="0.01"
          value={amount}
          disabled={!canEdit || saving}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{uiText('Responsável')}</Label>
        {canEdit ? (
          <OwnerSelector
            size="sm"
            value={opp.owner_user_id ?? null}
            onChange={(userId) => { if (userId !== (opp.owner_user_id ?? null)) void save({ owner_user_id: userId }); }}
            placeholder={uiText('Sem responsável')}
          />
        ) : (
          <OwnerSelectorReadOnly value={opp.owner_user_id ?? null} />
        )}
      </div>

      <CustomFieldsCard key={`cf-opp-${opp.id}`} module="opportunities" recordId={opp.id} compact bare />

      {/* Pendências para ganhar (documentos, dados do contato, classificação): mesma
          avaliação do diálogo de fechamento. Some quando a org não usa política (mode off). */}
      {organization?.id && (
        <OpportunityReadinessCard
          organizationId={organization.id}
          opportunityId={opp.id}
          compact
          reloadKey={reloadKey}
          onEditContact={onEditContact}
          onGoToDocuments={onOpenDocuments}
        />
      )}

      {canEdit && (
        <div className="grid grid-cols-3 gap-1.5">
          <Button type="button" variant="outline" size="sm" className="px-1 text-xs" onClick={onWon}>
            <TrendUp className="h-3.5 w-3.5 mr-1 text-green-600" />{uiText('Ganho')}
          </Button>
          <Button type="button" variant="outline" size="sm" className="px-1 text-xs" onClick={onLost}>
            <TrendDown className="h-3.5 w-3.5 mr-1 text-red-600" />{uiText('Perdido')}
          </Button>
          <Button type="button" variant="outline" size="sm" className="px-1 text-xs" onClick={onMoveStage}>
            <ArrowsLeftRight className="h-3.5 w-3.5 mr-1" />{uiText('Etapa')}
          </Button>
        </div>
      )}

      {/* Gerador de contrato: mesmo botão da tela da oportunidade. Só aparece para
          orgs com a SuvSign conectada (V2) ou com a integração antiga (V1). */}
      {canEdit && contactId && (
        <div className="flex flex-wrap gap-1.5 [&_button]:text-xs">
          <ContractSignatureEntry contactId={contactId} opportunityId={opp.id} size="sm" />
        </div>
      )}

    </div>
  );
}

// Sem permissão de editar: mostra o nome do responsável sem o seletor.
function OwnerSelectorReadOnly({ value }: { value: string | null }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!value) { setName(null); return; }
    let alive = true;
    void supabase.from('users').select('full_name').eq('id', value).maybeSingle().then(({ data }) => {
      if (alive) setName((data as { full_name?: string } | null)?.full_name ?? null);
    });
    return () => { alive = false; };
  }, [value]);
  return <p className="text-sm">{name || uiText('Sem responsável')}</p>;
}

// Oportunidades fechadas (ganhas/perdidas) do contato: só consulta, mais recentes primeiro.
// Recarrega quando uma aberta é fechada (a contagem de abertas muda) ou ao voltar de subtelas.
function ClosedOpportunities({ contactId, reloadKey, onOpenDocuments }: {
  contactId: string;
  reloadKey: string;
  onOpenDocuments: (opportunityId: string) => void;
}) {
  const { organization } = useOrganization();
  const { data: closed = [] } = useQuery({
    queryKey: ['ficha-closed-opps', contactId, reloadKey],
    enabled: !!organization?.id && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunities')
        .select('id, title, status, amount, currency, close_date, updated_at')
        .eq('organization_id', organization!.id)
        .eq('contact_id', contactId)
        .in('status', ['won', 'lost'])
        .is('deleted_at', null)
        .order('close_date', { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; status: 'won' | 'lost'; amount: number | null; currency: string | null; close_date: string | null }>;
    },
  });

  if (closed.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-medium text-muted-foreground">{uiText('Fechadas')}</p>
      {closed.map((o) => {
        const won = o.status === 'won';
        const date = o.close_date ? format(new Date(`${o.close_date.slice(0, 10)}T12:00:00`), uiDatePattern(), { locale: uiDateLocale() }) : null;
        const amount = Number(o.amount ?? 0);
        return (
          <div key={o.id} className="rounded-lg border border-border/70 bg-muted/30 p-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-snug min-w-0 break-words" title={o.title}>{o.title}</p>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${won ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'}`}>
                {won ? uiText('Ganha') : uiText('Perdida')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {date ?? '—'}
                {amount > 0 && ` · ${amount.toLocaleString(undefined, { style: 'currency', currency: o.currency || organization?.default_currency || 'BRL' })}`}
              </span>
              <button type="button" className="text-primary hover:underline" onClick={() => onOpenDocuments(o.id)}>
                {uiText('Documentos')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
