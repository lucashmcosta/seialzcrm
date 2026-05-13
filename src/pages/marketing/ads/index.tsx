import { useMemo, useState } from 'react';
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
  ACTIVE: 'bg-success/15 text-success border-success/30',
  PAUSED: 'bg-warning/15 text-warning border-warning/30',
  DELETED: 'bg-destructive/15 text-destructive border-destructive/30',
  ARCHIVED: 'bg-muted text-muted-foreground border-border',
};

export default function MarketingAds() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [status, setStatus] = useState('all');
  const [campaign, setCampaign] = useState('all');
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

  const rows = useMemo(() => {
    const list = [...(ads.data || [])];
    list.sort((a, b) => {
      const av = Number(a[sort.key] || 0);
      const bv = Number(b[sort.key] || 0);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [ads.data, sort]);

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
            <SelectItem value="ACTIVE">Ativos</SelectItem>
            <SelectItem value="PAUSED">Pausados</SelectItem>
            <SelectItem value="DELETED">Deletados</SelectItem>
          </SelectContent>
        </Select>

        <Select value={campaign} onValueChange={setCampaign}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Campanha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas campanhas</SelectItem>
            {(campaigns.data || []).map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
                  <SortHead k="leads_total" label="Leads" />
                  <SortHead k="cpl_real_brl" label="CPL" />
                  <SortHead k="opps_open" label="Opps" />
                  <SortHead k="opps_won" label="Wins" />
                  <SortHead k="cac_brl" label="CAC" />
                  <SortHead k="roas" label="ROAS" />
                </tr>
              </thead>
              <tbody>
                {rows.map(ad => {
                  const ctr = ad.ctr_basis_points != null ? Number(ad.ctr_basis_points) / 100 : null;
                  return (
                    <tr key={ad.marketing_campaign_id} className="border-b border-border last:border-0 hover:bg-muted/30">
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
                            <div className="text-[11px] text-muted-foreground truncate">{ad.adset_name} · {ad.campaign_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={cn('text-[10px] uppercase', STATUS_COLORS[ad.ad_status || ''] || 'bg-muted')}>
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
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MarketingLayout>
  );
}
