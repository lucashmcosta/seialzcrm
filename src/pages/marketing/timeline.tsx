import { useMemo, useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from './_components/MarketingLayout';
import { PeriodFilter } from './_components/PeriodFilter';
import { ChartSkeleton, TableSkeleton } from './_components/Skeletons';
import { EmptyState } from './_components/EmptyState';
import { useMarketingPeriod } from './_hooks/useMarketingPeriod';
import { useTimeSeries } from './_hooks/useOverview';
import { useAdPerformance } from './_hooks/useAdPerformance';
import { fmtBRL, fmtInt, fmtDateBR } from './_lib/format';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

const METRICS = [
  { key: 'spend', label: 'Investido', color: 'hsl(var(--primary))', currency: true },
  { key: 'leads', label: 'Leads', color: 'hsl(var(--success))' },
  { key: 'cpl', label: 'CPL real', color: 'hsl(40 90% 55%)', currency: true },
  { key: 'impressions', label: 'Impressões', color: 'hsl(220 70% 55%)' },
  { key: 'clicks', label: 'Cliques', color: 'hsl(180 60% 45%)' },
] as const;

export default function MarketingTimeline() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { preset, setPreset, custom, setCustom, range } = useMarketingPeriod('last_30');
  const ts = useTimeSeries(orgId, range.from, range.to);
  const ads = useAdPerformance(orgId);
  const [selected, setSelected] = useState<Record<string, boolean>>({ spend: true, leads: true, cpl: false, impressions: false, clicks: false });
  const [filterId, setFilterId] = useState('all');

  const data = useMemo(() => {
    return (ts.data || []).map(d => ({
      ...d,
      cpl: d.leads > 0 ? +(d.spend / d.leads).toFixed(2) : 0,
    }));
  }, [ts.data]);

  const dataWithDelta = useMemo(() => {
    return data.map((d, i) => {
      const prev = data[i - 1];
      return {
        ...d,
        spend_delta: prev ? d.spend - prev.spend : 0,
        leads_delta: prev ? d.leads - prev.leads : 0,
      };
    });
  }, [data]);

  return (
    <MarketingLayout title="Histórico Diário">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodFilter preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} />
        <Select value={filterId} onValueChange={setFilterId}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os ads</SelectItem>
            {(ads.data || []).map(a => (
              <SelectItem key={a.marketing_campaign_id} value={a.marketing_campaign_id}>
                {a.ad_name || a.ad_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-4 mb-3">
          {METRICS.map(m => (
            <label key={m.key} className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={selected[m.key]} onCheckedChange={(v) => setSelected(s => ({ ...s, [m.key]: !!v }))} />
              <span className="font-medium" style={{ color: m.color }}>{m.label}</span>
            </label>
          ))}
        </div>

        {ts.isLoading ? (
          <ChartSkeleton />
        ) : data.length === 0 ? (
          <EmptyState title="Sem dados no período" hint="O sync diário roda às 03:00 BRT." />
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {METRICS.filter(m => selected[m.key]).map(m => (
                  <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Detalhes por dia</h3>
        </div>
        {ts.isLoading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
        ) : dataWithDelta.length === 0 ? (
          <EmptyState title="Sem dados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-muted-foreground border-b border-border">
                  <th className="py-2 px-3 font-medium text-xs text-left">Data</th>
                  <th className="py-2 px-3 font-medium text-xs text-right">Investido</th>
                  <th className="py-2 px-3 font-medium text-xs text-right">Δ vs dia anterior</th>
                  <th className="py-2 px-3 font-medium text-xs text-right">Impressões</th>
                  <th className="py-2 px-3 font-medium text-xs text-right">Cliques</th>
                  <th className="py-2 px-3 font-medium text-xs text-right">Leads</th>
                  <th className="py-2 px-3 font-medium text-xs text-right">Δ leads</th>
                  <th className="py-2 px-3 font-medium text-xs text-right">CPL</th>
                </tr>
              </thead>
              <tbody>
                {[...dataWithDelta].reverse().map(d => (
                  <tr key={d.date} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-3 text-xs">{fmtDateBR(d.date)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtBRL(d.spend)}</td>
                    <td className={`py-2 px-3 text-right font-mono text-[11px] ${d.spend_delta > 0 ? 'text-success' : d.spend_delta < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {d.spend_delta > 0 ? '+' : ''}{fmtBRL(d.spend_delta)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(d.impressions)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(d.clicks)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(d.leads)}</td>
                    <td className={`py-2 px-3 text-right font-mono text-[11px] ${d.leads_delta > 0 ? 'text-success' : d.leads_delta < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {d.leads_delta > 0 ? '+' : ''}{d.leads_delta}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">{d.cpl > 0 ? fmtBRL(d.cpl) : '—'}</td>
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
