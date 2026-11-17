import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretDown, CaretRight, XCircle } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * "Por que perdemos" — oportunidades perdidas no período, agrupadas por motivo
 * e detalhe de perda. Usa o mesmo recorte do KPI "Perdidas" (status = lost e
 * close_date no período), então o total do card bate com o número do topo.
 * Perdas sem registro de motivo aparecem como "Sem motivo registrado".
 */

interface Props {
  organizationId: string;
  fromDay: string; // YYYY-MM-DD
  toDay: string; // YYYY-MM-DD
  ownerId: string; // 'all' ou id do responsável
  locale?: string;
}

interface LossRow {
  reason_id: string | null;
  detail_id: string | null;
  reopened_at: string | null;
  lost_at: string;
}

interface LostOpp {
  id: string;
  title: string | null;
  close_date: string | null;
  contacts?: { full_name: string | null } | null;
  users?: { full_name: string | null } | null;
  opportunity_losses?: LossRow[] | null;
}

interface CatalogItem {
  id: string;
  code: string;
  name: string;
}

interface Group {
  key: string;
  label: string;
  count: number;
  opps: LostOpp[];
}

interface ReasonGroup extends Group {
  details: Group[];
}

const NO_REASON = '__none__';
const PAGE = 1000;
const MAX_ROWS = 10000;

const parseLocalDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/** A perda vigente: a mais recente ainda não reaberta. */
function currentLoss(o: LostOpp): LossRow | null {
  const rows = (o.opportunity_losses ?? []).filter((l) => !l.reopened_at);
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (a.lost_at >= b.lost_at ? a : b));
}

export function LossReasonsCard({ organizationId, fromDay, toDay, ownerId, locale = 'pt-BR' }: Props) {
  const navigate = useNavigate();
  const [opps, setOpps] = useState<LostOpp[]>([]);
  const [reasons, setReasons] = useState<CatalogItem[]>([]);
  const [details, setDetails] = useState<(CatalogItem & { reason_id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openList, setOpenList] = useState<Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rRes, dRes] = await Promise.all([
          supabase
            .from('opportunity_loss_reasons')
            .select('id, code, name')
            .eq('organization_id', organizationId),
          supabase
            .from('opportunity_loss_reason_details')
            .select('id, code, name, reason_id')
            .eq('organization_id', organizationId),
        ]);

        const all: LostOpp[] = [];
        for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
          let q = supabase
            .from('opportunities')
            .select(
              'id, title, close_date, contacts:contact_id(full_name), users:owner_user_id(full_name), opportunity_losses(reason_id, detail_id, reopened_at, lost_at)',
            )
            .eq('organization_id', organizationId)
            .is('deleted_at', null)
            .eq('status', 'lost')
            .gte('close_date', fromDay)
            .lte('close_date', toDay)
            .order('close_date', { ascending: false })
            .order('id')
            .range(offset, offset + PAGE - 1);
          if (ownerId !== 'all') q = q.eq('owner_user_id', ownerId);
          const { data, error } = await q;
          if (error) throw error;
          const page = (data ?? []) as unknown as LostOpp[];
          all.push(...page);
          if (page.length < PAGE) break;
        }

        if (cancelled) return;
        setReasons((rRes.data ?? []) as CatalogItem[]);
        setDetails((dRes.data ?? []) as (CatalogItem & { reason_id: string })[]);
        setOpps(all);
        setTruncated(all.length >= MAX_ROWS);
      } catch (e) {
        console.error('LossReasonsCard fetch error:', e);
        if (!cancelled) setOpps([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, fromDay, toDay, ownerId]);

  const groups: ReasonGroup[] = useMemo(() => {
    const reasonById = new Map(reasons.map((r) => [r.id, r]));
    const detailById = new Map(details.map((d) => [d.id, d]));
    const byReason = new Map<string, { opps: LostOpp[]; byDetail: Map<string, LostOpp[]> }>();

    for (const o of opps) {
      const loss = currentLoss(o);
      const detail = loss?.detail_id ? detailById.get(loss.detail_id) : undefined;
      const reasonId = loss?.reason_id ?? detail?.reason_id ?? null;
      const rKey = reasonId && reasonById.has(reasonId) ? reasonId : NO_REASON;
      const dKey = detail ? detail.id : NO_REASON;
      if (!byReason.has(rKey)) byReason.set(rKey, { opps: [], byDetail: new Map() });
      const g = byReason.get(rKey)!;
      g.opps.push(o);
      if (!g.byDetail.has(dKey)) g.byDetail.set(dKey, []);
      g.byDetail.get(dKey)!.push(o);
    }

    const label = (item: CatalogItem | undefined, fallback: string) =>
      item ? `${item.code} · ${item.name}` : fallback;

    return [...byReason.entries()]
      .map(([rKey, g]) => ({
        key: rKey,
        label: rKey === NO_REASON ? 'Sem motivo registrado' : label(reasonById.get(rKey), 'Motivo removido'),
        count: g.opps.length,
        opps: g.opps,
        details:
          rKey === NO_REASON
            ? []
            : [...g.byDetail.entries()]
                .map(([dKey, list]) => ({
                  key: `${rKey}:${dKey}`,
                  label: dKey === NO_REASON ? 'Sem detalhe' : label(detailById.get(dKey), 'Detalhe removido'),
                  count: list.length,
                  opps: list,
                }))
                .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => {
        // "Sem motivo" sempre por último, para não esconder os motivos reais.
        if (a.key === NO_REASON) return 1;
        if (b.key === NO_REASON) return -1;
        return b.count - a.count;
      });
  }, [opps, reasons, details]);

  const total = opps.length;
  const max = Math.max(1, ...groups.map((g) => g.count));
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Por que perdemos</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Motivos das oportunidades perdidas no período. Clique para ver o detalhe.
          </p>
        </div>
        {!loading && total > 0 && (
          <span className="font-mono text-sm text-muted-foreground">
            {total.toLocaleString(locale)} perdidas
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded bg-muted" />
      ) : total === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Nenhuma perda no período
        </div>
      ) : (
        <ul className="space-y-1">
          {groups.map((g) => {
            const isOpen = expanded === g.key;
            const canExpand = g.details.length > 0;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => (canExpand ? setExpanded(isOpen ? null : g.key) : setOpenList(g))}
                  aria-expanded={canExpand ? isOpen : undefined}
                  className="w-full rounded px-2 py-2 text-left transition hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {canExpand ? (
                        isOpen ? (
                          <CaretDown size={12} className="flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <CaretRight size={12} className="flex-shrink-0 text-muted-foreground" />
                        )
                      ) : (
                        <span className="w-3 flex-shrink-0" />
                      )}
                      <span
                        className={`truncate ${g.key === NO_REASON ? 'text-muted-foreground italic' : 'text-foreground'}`}
                      >
                        {g.label}
                      </span>
                    </span>
                    <span className="flex-shrink-0 font-mono text-xs text-muted-foreground">
                      {g.count.toLocaleString(locale)} · {pct(g.count).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1.5 ml-[18px] h-2 rounded-full bg-muted/60">
                    <div
                      className={`h-2 rounded-full ${g.key === NO_REASON ? 'bg-muted-foreground/40' : 'bg-primary'}`}
                      style={{ width: `${(g.count / max) * 100}%` }}
                    />
                  </div>
                </button>

                {isOpen && (
                  <ul className="mb-2 ml-[26px] space-y-0.5 border-l border-border pl-3">
                    {g.details.map((d) => (
                      <li key={d.key}>
                        <button
                          type="button"
                          onClick={() => setOpenList(d)}
                          className="w-full rounded px-2 py-1.5 text-left transition hover:bg-muted/50"
                        >
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-foreground">{d.label}</span>
                            <span className="flex-shrink-0 font-mono text-muted-foreground">
                              {d.count.toLocaleString(locale)} · {pct(d.count).toFixed(0)}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted/60">
                            <div
                              className="h-1.5 rounded-full bg-primary/60"
                              style={{ width: `${(d.count / g.count) * 100}%` }}
                            />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {truncated && (
        <p className="mt-3 text-xs text-muted-foreground">
          Mostrando as {MAX_ROWS.toLocaleString(locale)} perdas mais recentes. Reduza o período para ver tudo.
        </p>
      )}

      <Dialog open={openList !== null} onOpenChange={(o) => !o && setOpenList(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle size={18} className="text-destructive" />
              <span className="truncate">
                {openList?.label} — {openList?.count}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto -mx-6 px-6">
            <ul className="divide-y divide-border">
              {(openList?.opps ?? []).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenList(null);
                      navigate(`/opportunities/${o.id}`);
                    }}
                    className="w-full rounded px-2 py-3 text-left transition hover:bg-muted/50"
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {o.contacts?.full_name || '(sem contato)'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.title || '(sem título)'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Perdida em {parseLocalDate(o.close_date)?.toLocaleDateString(locale) ?? '—'}
                      {` · Responsável: ${o.users?.full_name || '—'}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
