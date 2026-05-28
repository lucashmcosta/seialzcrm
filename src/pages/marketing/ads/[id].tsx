import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MarketingLayout } from '../_components/MarketingLayout';
import { MetricCard } from '../_components/MetricCard';
import { ChartSkeleton, TableSkeleton } from '../_components/Skeletons';
import { EmptyState } from '../_components/EmptyState';
import { useAdById } from '../_hooks/useAdPerformance';
import { useAdOpportunities, useAdDailyInsights, useAdLeads, type AdOpportunity } from '../_hooks/useAdLeads';
import { fmtBRL, fmtInt, fmtDateBR, fmtRoas } from '../_lib/format';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { ArrowLeft, Pause, PencilSimple } from '@phosphor-icons/react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<AdLead['lifecycle_status'], { label: string; cls: string }> = {
  lead: { label: 'Lead', cls: 'bg-muted text-muted-foreground' },
  open: { label: 'Opp Aberta', cls: 'bg-warning/15 text-warning border-warning/30' },
  won: { label: 'Won', cls: 'bg-success/15 text-success border-success/30' },
  lost: { label: 'Lost', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export default function AdDrilldown() {
  const { id } = useParams<{ id: string }>();
  const ad = useAdById(id);
  const insights = useAdDailyInsights(id, 30);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const leads = useAdLeads(id, { status: statusFilter, search, limit: 200 });

  const a = ad.data;

  return (
    <MarketingLayout title="Detalhes do Ad">
      <div>
        <Link to="/marketing/ads" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> Voltar para Ads
        </Link>
      </div>

      {ad.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !a ? (
        <EmptyState title="Ad não encontrado" />
      ) : (
        <div className="rounded-md border border-border bg-card p-4 flex gap-4 items-start">
          {a.creative_thumbnail_url ? (
            <img src={a.creative_thumbnail_url} alt="" className="w-24 h-24 rounded object-cover flex-shrink-0 bg-muted" />
          ) : (
            <div className="w-24 h-24 rounded bg-muted flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{a.ad_name || a.ad_id}</h2>
            <div className="text-xs text-muted-foreground mt-1">
              {a.campaign_name} · {a.adset_name}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-[10px] uppercase">{a.ad_status || '—'}</Badge>
              {a.last_insight_date && (
                <span className="text-[11px] text-muted-foreground">Último insight: {fmtDateBR(a.last_insight_date)}</span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Ações</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled><Pause size={14} className="mr-2" /> Pausar (em breve)</DropdownMenuItem>
              <DropdownMenuItem disabled><PencilSimple size={14} className="mr-2" /> Editar (em breve)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {a && (a.creative_headline || a.creative_body || a.destination_url) && (
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2">Creative</h3>
          {a.creative_headline && <p className="text-sm font-medium">{a.creative_headline}</p>}
          {a.creative_body && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{a.creative_body}</p>}
          {a.destination_url && (
            <a href={a.destination_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block mt-2 truncate">
              {a.destination_url}
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Investido" value={fmtBRL(a?.spend_brl ?? 0)} loading={ad.isLoading} />
        <MetricCard label="Leads" value={fmtInt(a?.leads_total ?? 0)} loading={ad.isLoading} accent="success" />
        <MetricCard label="Opps Abertas" value={fmtInt(a?.opps_open ?? 0)} loading={ad.isLoading} />
        <MetricCard label="Wins" value={fmtInt(a?.opps_won ?? 0)} loading={ad.isLoading} accent="success" sublabel={`ROAS ${fmtRoas(a?.roas)}`} />
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Investimento × Leads (30 dias)</h3>
        {insights.isLoading ? (
          <ChartSkeleton height={220} />
        ) : !insights.data || insights.data.length === 0 ? (
          <EmptyState title="Sem dados diários" />
        ) : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={insights.data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={70} tickFormatter={(v) => fmtBRL(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }} formatter={(v: any, n: string) => n === 'spend' ? fmtBRL(v) : fmtInt(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="spend" name="Investido" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="leads" name="Leads" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-wrap gap-3 items-center justify-between">
          <h3 className="text-sm font-semibold">Leads atribuídos</h3>
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48 h-8 text-xs" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="open">Opp aberta</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {leads.isLoading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={5} /></div>
        ) : (leads.data || []).length === 0 ? (
          <EmptyState title="Nenhum lead atribuído" hint="Verifique se o tracking de Meta CTWA está ativo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-muted-foreground border-b border-border">
                  <th className="py-2 px-3 font-medium text-xs text-left">Nome</th>
                  <th className="py-2 px-3 font-medium text-xs text-left">Telefone</th>
                  <th className="py-2 px-3 font-medium text-xs text-left">Email</th>
                  <th className="py-2 px-3 font-medium text-xs text-left">Primeiro contato</th>
                  <th className="py-2 px-3 font-medium text-xs text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {(leads.data || []).map(l => {
                  const s = STATUS_LABEL[l.lifecycle_status];
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3">
                        <Link to={`/contacts/${l.id}`} className="text-foreground hover:text-primary font-medium">
                          {l.full_name || '(sem nome)'}
                        </Link>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs">{l.phone || '—'}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{l.email || '—'}</td>
                      <td className="py-2 px-3 text-xs">{fmtDateBR(l.first_contact_at)}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={cn('text-[10px]', s.cls)}>{s.label}</Badge>
                      </td>
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
