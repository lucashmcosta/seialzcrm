import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from '../_components/MarketingLayout';
import { TableSkeleton } from '../_components/Skeletons';
import { EmptyState } from '../_components/EmptyState';
import { useAdPerformance, useCampaignsList, type AdPerfRow } from '../_hooks/useAdPerformance';
import { useMarketingPeriod } from '../_hooks/useMarketingPeriod';
import { PeriodFilter } from '../_components/PeriodFilter';
import { fmtBRL, fmtInt, fmtPct, fmtRoas } from '../_lib/format';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CaretUp, CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

type SortKey = keyof Pick<AdPerfRow, 'spend_brl' | 'impressions' | 'clicks' | 'leads_total' | 'cpl_real_brl' | 'opps_open' | 'opps_won' | 'cac_brl' | 'roas'>;

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-success/15 text-success border-success/30',
  paused: 'bg-warning/15 text-warning border-warning/30',
  deleted: 'bg-destructive/15 text-destructive border-destructive/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

type Totals = {
  spend_brl: number;
  impressions: number;
  clicks: number;
  leads_total: number;
  opps_open: number;
  opps_won: number;
  revenue_won_brl: number;
};

const emptyTotals = (): Totals => ({
  spend_brl: 0, impressions: 0, clicks: 0, leads_total: 0,
  opps_open: 0, opps_won: 0, revenue_won_brl: 0,
});

const sumInto = (t: Totals, r: AdPerfRow) => {
  t.spend_brl += Number(r.spend_brl || 0);
  t.impressions += Number(r.impressions || 0);
  t.clicks += Number(r.clicks || 0);
  t.leads_total += Number(r.leads_total || 0);
  t.opps_open += Number(r.opps_open || 0);
  t.opps_won += Number(r.opps_won || 0);
  t.revenue_won_brl += Number(r.revenue_won_brl || 0);
};

const ctrOf = (t: Totals) => t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null;
const cplOf = (t: Totals) => t.leads_total > 0 ? t.spend_brl / t.leads_total : null;
const cacOf = (t: Totals) => t.opps_won > 0 ? t.spend_brl / t.opps_won : null;
const roasOf = (t: Totals) => t.spend_brl > 0 ? t.revenue_won_brl / t.spend_brl : null;

export default function MarketingAds() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [status, setStatus] = useState('all');
  const [campaign, setCampaign] = useState('all');
  const [adset, setAdset] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'spend_brl', dir: 'desc' });
  const period = useMarketingPeriod('last_30');

  const ads = useAdPerformance(orgId, {
    status,
    campaignId: campaign,
    search,
    from: period.range.from,
    to: period.range.to,
  });
  const campaigns = useCampaignsList(orgId);

  // Distinct adsets within the currently filtered (status/campaign) dataset
  const adsets = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of ads.data || []) {
      const name = r.adset_name || '(sem adset)';
      map.set(name, name);
    }
    return Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [ads.data]);

  // Filter by adset client-side, then sort
  const rows = useMemo(() => {
    const list = (ads.data || []).filter(r => {
      if (adset === 'all') return true;
      return (r.adset_name || '(sem adset)') === adset;
    });
    list.sort((a, b) => {
      const av = Number(a[sort.key] || 0);
      const bv = Number(b[sort.key] || 0);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [ads.data, adset, sort]);

  // Group by adset, then compute subtotals + grand total
  const grouped = useMemo(() => {
    const groups = new Map<string, AdPerfRow[]>();
    for (const r of rows) {
      const key = r.adset_name || '(sem adset)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const result = Array.from(groups.entries()).map(([name, items]) => {
      const totals = emptyTotals();
      items.forEach(it => sumInto(totals, it));
      return { name, items, totals };
    });
    // Sort groups by spend desc
    result.sort((a, b) => b.totals.spend_brl - a.totals.spend_brl);
    const grand = emptyTotals();
    rows.forEach(r => sumInto(grand, r));
    return { groups: result, grand };
  }, [rows]);

  const toggleSort = (key: SortKey) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const SortHead = ({ k, label, align = 'right' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th className={cn('py-2 px-3 font-medium text-xs select-none cursor-pointer', align === 'right' ? 'text-right' : 'text-left')} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.key === k && (sort.dir === 'asc' ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />)}
      </span>
    </th>
  );

  const TotalsRow = ({ totals, label, variant }: { totals: Totals; label: string; variant: 'subtotal' | 'grand' }) => {
    const ctr = ctrOf(totals);
    const cpl = cplOf(totals);
    const cac = cacOf(totals);
    const roas = roasOf(totals);
    const cls = variant === 'grand'
      ? 'bg-primary/10 font-semibold border-t-2 border-primary/40'
      : 'bg-muted/40 font-medium';
    return (
      <tr className={cn(cls, 'border-b border-border')}>
        <td className="py-2 px-3 text-xs uppercase tracking-wide text-muted-foreground" colSpan={2}>{label}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{fmtBRL(totals.spend_brl)}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(totals.impressions)}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(totals.clicks)}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{ctr != null ? fmtPct(ctr, 2) : '—'}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(totals.leads_total)}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{cpl != null ? fmtBRL(cpl) : '—'}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(totals.opps_open)}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(totals.opps_won)}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{cac != null ? fmtBRL(cac) : '—'}</td>
        <td className="py-2 px-3 text-right font-mono text-xs">{fmtRoas(roas)}</td>
      </tr>
    );
  };

  return (
    <MarketingLayout title="Performance por Ad">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodFilter
          preset={period.preset}
          setPreset={period.setPreset}
          custom={period.custom}
          setCustom={period.setCustom}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
            <SelectItem value="deleted">Deletados</SelectItem>
          </SelectContent>
        </Select>

        <Select value={campaign} onValueChange={(v) => { setCampaign(v); setAdset('all'); }}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Campanha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas campanhas</SelectItem>
            {(campaigns.data || []).map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={adset} onValueChange={setAdset}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Adset" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos adsets</SelectItem>
            {adsets.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar ad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        {ads.isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={8} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum ad encontrado" hint="Ajuste os filtros ou aguarde o próximo sync." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 px-3 font-medium text-xs">Ad</th>
                  <th className="py-2 px-3 font-medium text-xs">Status</th>
                  <SortHead k="spend_brl" label="Investido" />
                  <SortHead k="impressions" label="Impr." />
                  <SortHead k="clicks" label="Cliques" />
                  <th className="py-2 px-3 font-medium text-xs text-right">CTR</th>
                  <SortHead k="leads_total" label="Contatos" />
                  <SortHead k="cpl_real_brl" label="CPL" />
                  <SortHead k="opps_open" label="Opps" />
                  <SortHead k="opps_won" label="Wins" />
                  <SortHead k="cac_brl" label="CAC" />
                  <SortHead k="roas" label="ROAS" />
                </tr>
              </thead>
              <tbody>
                {grouped.groups.map(group => (
                  <Fragment key={`grp-${group.name}`}>
                    <tr key={`hdr-${group.name}`} className="bg-muted/20 border-b border-border">
                      <td colSpan={12} className="py-1.5 px-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                        Adset: <span className="text-foreground">{group.name}</span>
                        <span className="ml-2 text-muted-foreground">· {group.items.length} ad{group.items.length > 1 ? 's' : ''}</span>
                      </td>
                    </tr>
                    {group.items.map(ad => {
                      const ctr = ad.ctr_basis_points != null ? Number(ad.ctr_basis_points) / 100 : null;
                      return (
                        <tr key={ad.marketing_campaign_id} className="border-b border-border hover:bg-muted/30">
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2.5 min-w-0 max-w-[280px]">
                              {ad.creative_thumbnail_url ? (
                                <img src={ad.creative_thumbnail_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 bg-muted" loading="lazy" />
                              ) : (
                                <div className="w-10 h-10 rounded bg-muted flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <Link to={`/marketing/ads/${ad.marketing_campaign_id}`} className="text-foreground hover:text-primary font-medium block truncate">
                                  {ad.ad_name || ad.ad_id}
                                </Link>
                                <div className="text-[11px] text-muted-foreground truncate">{ad.campaign_name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className={cn('text-[10px] uppercase', STATUS_COLORS[(ad.ad_status || '').toLowerCase()] || 'bg-muted')}>
                              {ad.ad_status || '—'}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{fmtBRL(ad.spend_brl)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(ad.impressions)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(ad.clicks)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{ctr != null ? fmtPct(ctr, 2) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">
                            <Link to={`/marketing/ads/${ad.marketing_campaign_id}`} className="text-primary hover:underline">
                              {fmtInt(ad.leads_total)}
                            </Link>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{ad.cpl_real_brl != null ? fmtBRL(ad.cpl_real_brl) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(ad.opps_open)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(ad.opps_won)}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{ad.cac_brl != null ? fmtBRL(ad.cac_brl) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{fmtRoas(ad.roas)}</td>
                        </tr>
                      );
                    })}
                    <TotalsRow key={`sub-${group.name}`} totals={group.totals} label={`Subtotal · ${group.name}`} variant="subtotal" />
                  </Fragment>
                ))}
                <TotalsRow totals={grouped.grand} label="Total geral" variant="grand" />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MarketingLayout>
  );
}
