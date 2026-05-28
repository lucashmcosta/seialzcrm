import { Link } from 'react-router-dom';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from './_components/MarketingLayout';
import { PeriodFilter } from './_components/PeriodFilter';
import { MetricCard } from './_components/MetricCard';
import { EmptyState } from './_components/EmptyState';
import { ChartSkeleton, TableSkeleton } from './_components/Skeletons';
import { SyncStatusCard } from './_components/SyncStatusCard';
import { useMarketingPeriod } from './_hooks/useMarketingPeriod';
import { useOverviewWithCompare, useTimeSeries } from './_hooks/useOverview';
import { useAdPerformance } from './_hooks/useAdPerformance';
import { fmtBRL, fmtInt, fmtPct, fmtRoas } from './_lib/format';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

export default function MarketingOverview() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { preset, setPreset, custom, setCustom, range } = useMarketingPeriod('last_30');

  const { current, previous } = useOverviewWithCompare(orgId, range.from, range.to);
  const ts = useTimeSeries(orgId, range.from, range.to);
  const topAds = useAdPerformance(orgId);

  const k = current.data;
  const p = previous.data;
  const loading = current.isLoading;

  const top5 = (topAds.data || []).slice(0, 5);

  return (
    <MarketingLayout>
      <SyncStatusCard orgId={orgId} />
      <PeriodFilter preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} />

      {/* KPI grid 3x2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label="Investido" value={fmtBRL(k?.spend ?? 0)} current={k?.spend} previous={p?.spend} loading={loading} />
        <MetricCard label="Impressões" value={fmtInt(k?.impressions ?? 0)} current={k?.impressions} previous={p?.impressions} loading={loading} mono />
        <MetricCard label="Cliques" value={fmtInt(k?.clicks ?? 0)} current={k?.clicks} previous={p?.clicks} loading={loading} mono />
        <MetricCard label="Contatos (CRM)" value={fmtInt(k?.leads ?? 0)} current={k?.leads} previous={p?.leads} loading={loading} accent="success" />

        <MetricCard label="Oportunidades abertas" value={fmtInt(k?.opps_open ?? 0)} current={k?.opps_open} previous={p?.opps_open} loading={loading} />
        <MetricCard label="Wins" value={fmtInt(k?.wins ?? 0)} current={k?.wins} previous={p?.wins} loading={loading} accent="success" />
      </div>

      {/* Secondary metrics 4x1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="CPL real" value={k?.cpl_real != null ? fmtBRL(k.cpl_real) : '—'} loading={loading} accent="warning" />
        <MetricCard label="CAC" value={k?.cac != null ? fmtBRL(k.cac) : '—'} loading={loading} accent="warning" />
        <MetricCard label="ROAS" value={fmtRoas(k?.roas)} loading={loading} accent={k?.roas && k.roas >= 1 ? 'success' : 'destructive'} />
        <MetricCard label="Contato → Opp" value={k?.lead_to_opp_pct != null ? fmtPct(k.lead_to_opp_pct) : '—'} loading={loading} />
      </div>

      {/* Time series */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Investimento × Contatos por dia</h3>
          <span className="text-xs text-muted-foreground">{ts.data?.length || 0} dias</span>
        </div>
        {ts.isLoading ? (
          <ChartSkeleton />
        ) : !ts.data || ts.data.length === 0 ? (
          <EmptyState title="Sem dados no período" hint="O sync diário roda às 03:00 BRT — verifique se há ads ativos." />
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={ts.data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => fmtBRL(v)} width={80} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
                  formatter={(v: any, name: string) => name === 'spend' ? fmtBRL(v) : fmtInt(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="spend" name="Investido" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="leads" name="Contatos" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top 5 ads */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Top 5 ads por leads</h3>
          <Link to="/marketing/ads" className="text-xs text-primary hover:underline">Ver todos →</Link>
        </div>
        {topAds.isLoading ? <TableSkeleton rows={5} cols={4} /> : top5.length === 0 ? (
          <EmptyState title="Nenhum ad com dados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Ad</th>
                  <th className="py-2 px-3 font-medium text-right">Investido</th>
                  <th className="py-2 px-3 font-medium text-right">Contatos</th>
                  <th className="py-2 px-3 font-medium text-right">CPL</th>
                  <th className="py-2 px-3 font-medium text-right">Wins</th>
                  <th className="py-2 pl-3 font-medium text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {[...top5].sort((a, b) => Number(b.leads_total || 0) - Number(a.leads_total || 0)).slice(0, 5).map(ad => (
                  <tr key={ad.marketing_campaign_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <Link to={`/marketing/ads/${ad.marketing_campaign_id}`} className="text-foreground hover:text-primary font-medium">
                        {ad.ad_name || ad.ad_id}
                      </Link>
                      <div className="text-xs text-muted-foreground truncate max-w-[260px]">{ad.campaign_name}</div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtBRL(ad.spend_brl)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(ad.leads_total)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{ad.cpl_real_brl != null ? fmtBRL(ad.cpl_real_brl) : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(ad.opps_won)}</td>
                    <td className="py-2 pl-3 text-right font-mono text-xs">{fmtRoas(ad.roas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MarketingLayout>
  );
}
