import { useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from './_components/MarketingLayout';
import { ChartSkeleton } from './_components/Skeletons';
import { EmptyState } from './_components/EmptyState';
import { useFunnel } from './_hooks/useFunnel';
import { useAdPerformance } from './_hooks/useAdPerformance';
import { fmtInt, fmtPct } from './_lib/format';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const STAGES = [
  { key: 'impressions', label: 'Impressões', color: 'hsl(var(--primary))' },
  { key: 'clicks', label: 'Cliques', color: 'hsl(220 70% 55%)' },
  { key: 'conversations', label: 'Conversas', color: 'hsl(180 60% 45%)' },
  { key: 'leads', label: 'Contatos (CRM)', color: 'hsl(var(--success))' },
  { key: 'opps', label: 'Oportunidades', color: 'hsl(40 90% 55%)' },
  { key: 'won', label: 'Wins', color: 'hsl(140 70% 40%)' },
] as const;

export default function MarketingFunnel() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [filterId, setFilterId] = useState('all');

  const ads = useAdPerformance(orgId);
  const funnel = useFunnel(orgId, filterId);

  const data = funnel.data;
  const max = data?.impressions || 1;

  const conversionRates = data ? [
    { from: 'Impr', to: 'Click', value: data.imp_to_click_pct },
    { from: 'Click', to: 'Conv', value: data.click_to_conv_pct },
    { from: 'Conv', to: 'Lead', value: data.conv_to_lead_pct },
    { from: 'Click', to: 'Lead', value: data.click_to_lead_pct },
    { from: 'Lead', to: 'Opp', value: data.lead_to_opp_pct },
    { from: 'Opp', to: 'Won', value: data.opp_to_won_pct },
  ] : [];

  return (
    <MarketingLayout title="Funil de Conversão">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterId} onValueChange={setFilterId}>
          <SelectTrigger className="w-80"><SelectValue /></SelectTrigger>
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

      <div className="rounded-md border border-border bg-card p-6">
        <h3 className="text-sm font-semibold mb-5">Etapas do funil</h3>
        {funnel.isLoading ? (
          <ChartSkeleton height={400} />
        ) : !data || data.impressions === 0 ? (
          <EmptyState title="Sem dados de funil" hint="Selecione outro ad ou aguarde o próximo sync." />
        ) : (
          <div className="space-y-3">
            {STAGES.map((stage, idx) => {
              const value = Number(data[stage.key as keyof typeof data] || 0);
              const widthPct = (value / max) * 100;
              const prev = idx > 0 ? Number(data[STAGES[idx - 1].key as keyof typeof data] || 0) : null;
              const stepConv = prev && prev > 0 ? (value / prev) * 100 : null;
              const totalPct = (value / max) * 100;

              return (
                <div key={stage.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{stage.label}</span>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="font-mono">{fmtInt(value)}</span>
                      <span className="font-mono text-[11px]">{totalPct.toFixed(1)}% total</span>
                      {stepConv != null && (
                        <span className={cn('font-mono text-[11px]', stepConv < 50 ? 'text-warning' : 'text-success')}>
                          {stepConv.toFixed(1)}% ↓
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-9 rounded-md bg-muted/50 overflow-hidden">
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${Math.max(widthPct, 0.5)}%`, background: stage.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Taxas de conversão</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {conversionRates.map(r => (
            <div key={`${r.from}-${r.to}`} className="rounded border border-border p-3 bg-background/50">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.from} → {r.to}</div>
              <div className="text-lg font-semibold font-mono mt-1">{fmtPct(r.value, 2)}</div>
            </div>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}
