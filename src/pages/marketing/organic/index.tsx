import { useMemo, useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from '../_components/MarketingLayout';
import { PeriodFilter } from '../_components/PeriodFilter';
import { MetricCard } from '../_components/MetricCard';
import { EmptyState } from '../_components/EmptyState';
import { ChartSkeleton, TableSkeleton, CardSkeleton } from '../_components/Skeletons';
import { useMarketingPeriod } from '../_hooks/useMarketingPeriod';
import {
  useOrganicMedia, useAccountInsights, aggregate, timeseries, topBy, weeklySummary,
  engagementRateOf,
  type OrganicMediaRow, type OrganicMetric, type Availability,
  type PlatformFilter, type AccountInsights,
} from '../_hooks/useOrganic';
import { fmtInt, fmtPct, fmtDateBR, previousRange } from '../_lib/format';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { InstagramLogo, ArrowSquareOut } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

// ---- helpers de exibição (distinguem indisponível / zero / não-sincronizado) ----

// Célula de métrica por mídia: sem insight → "—"; coluna NULL → "n/d"; senão o número.
function MetricCell({ value, hasInsights }: { value: number | null; hasInsights: boolean | null }) {
  if (!hasInsights) return <span className="text-muted-foreground/60" title="Sem insights coletados para este conteúdo">—</span>;
  if (value == null) return <span className="text-muted-foreground/60" title="Métrica não disponibilizada pela API">n/d</span>;
  return <>{fmtInt(value)}</>;
}

// Valor + sublabel de um card de Overview segundo a disponibilidade agregada.
function overviewCard(label: string, total: number, avail: Availability, accent?: 'primary' | 'success' | 'warning', current?: number, previous?: number) {
  if (avail === 'available') {
    return { label, value: fmtInt(total), accent, current, previous } as const;
  }
  return {
    label,
    value: avail === 'unavailable' ? 'n/d' : '—',
    sublabel: avail === 'unavailable' ? 'Não disponibilizado pela API' : 'Sem insights coletados',
    accent,
  } as const;
}

const MEDIA_TYPE_LABEL: Record<string, string> = {
  reel: 'Reel', video: 'Vídeo', image: 'Imagem', carousel_album: 'Carrossel', post: 'Post',
};
function mediaTypeLabel(t: string | null): string {
  if (!t) return '—';
  return MEDIA_TYPE_LABEL[t] ?? t;
}

const TOP_METRICS: { key: OrganicMetric; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'reach', label: 'Alcance' },
  { key: 'likes', label: 'Curtidas' },
  { key: 'comments', label: 'Comentários' },
  { key: 'shares', label: 'Compart.' },
  { key: 'saves', label: 'Salvos' },
];

// Segmented control de origem: Instagram / Facebook / Todos.
function PlatformToggle({ value, onChange }: { value: PlatformFilter; onChange: (v: PlatformFilter) => void }) {
  const opts: { key: PlatformFilter; label: string }[] = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'all', label: 'Todos' },
  ];
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-[5px] transition-colors',
            value === o.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function MarketingOrganic() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { preset, setPreset, custom, setCustom, range } = useMarketingPeriod('last_30', 'organic');
  const [platform, setPlatform] = useState<PlatformFilter>('all');

  const media = useOrganicMedia(orgId, range.from, range.to, platform);
  const prev = previousRange(range.from, range.to);
  const mediaPrev = useOrganicMedia(orgId, prev.from, prev.to, platform);
  const account = useAccountInsights(orgId, range.from, range.to);

  const rows = useMemo(() => media.data ?? [], [media.data]);
  const agg = useMemo(() => aggregate(rows), [rows]);
  const aggPrev = useMemo(() => aggregate(mediaPrev.data ?? []), [mediaPrev.data]);
  const rangeDays = Math.round((range.to.getTime() - range.from.getTime()) / 86400000);

  const loading = media.isLoading;
  const isEmpty = !loading && rows.length === 0;

  return (
    <MarketingLayout title="Orgânico">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodFilter preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} />
        <PlatformToggle value={platform} onChange={setPlatform} />
      </div>

      {isEmpty ? (
        <EmptyState
          title="Sem conteúdo orgânico no período"
          hint="Selecione uma Página/Instagram na conexão Meta e rode o sync orgânico."
          icon={<InstagramLogo size={20} weight="light" />}
        />
      ) : (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="content">Conteúdo</TabsTrigger>
            <TabsTrigger value="top">Top conteúdos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="weekly">Resumo semanal</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <OverviewTab agg={agg} aggPrev={aggPrev} loading={loading}
              platform={platform} account={account.data ?? null} accountLoading={account.isLoading} rangeDays={rangeDays} />
          </TabsContent>
          <TabsContent value="content" className="mt-4">
            <ContentTab rows={rows} loading={loading} />
          </TabsContent>
          <TabsContent value="top" className="mt-4">
            <TopTab rows={rows} loading={loading} />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <HistoryTab rows={rows} loading={loading} range={range} />
          </TabsContent>
          <TabsContent value="weekly" className="mt-4">
            <WeeklyTab rows={rows} loading={loading} />
          </TabsContent>
        </Tabs>
      )}
    </MarketingLayout>
  );
}

// ---------------- Visão geral ----------------
function OverviewTab({ agg, aggPrev, loading, platform, account, accountLoading, rangeDays }: {
  agg: ReturnType<typeof aggregate>; aggPrev: ReturnType<typeof aggregate>; loading: boolean;
  platform: PlatformFilter; account: AccountInsights | null; accountLoading: boolean; rangeDays: number;
}) {
  if (loading) return <CardSkeleton count={6} />;

  const t = agg.totals, a = agg.availability, tp = aggPrev.totals;

  // Views/Alcance de NÍVEL DE CONTA (semântica Business Suite): views = todas as
  // reproduções no período; reach = contas ÚNICAS (dedup). Reach só existe p/ janelas ≤30d.
  const ig = account?.instagram, fb = account?.facebook;
  let accViews: number | null = null, accReach: number | null = null, viewsSrc = '', reachSrc = '';
  if (platform === 'instagram') {
    accViews = ig?.available ? ig.views : null; viewsSrc = 'nível de conta (Instagram)';
    accReach = ig?.available ? ig.reach : null;
    reachSrc = accReach != null ? 'contas únicas (dedup) · conta' : rangeDays > 30 ? 'reach de conta só p/ janela ≤30 dias' : 'indisponível';
  } else if (platform === 'facebook') {
    accViews = fb?.available ? fb.views : null; viewsSrc = fb?.available ? 'nível de conta (Facebook)' : 'soma por conteúdo';
    accReach = null; reachSrc = 'reach de Página indisponível na API (Graph v26)';
  } else {
    accViews = account?.combined.views_available ? account.combined.views : null; viewsSrc = 'nível de conta (Instagram + Facebook)';
    accReach = account?.combined.reach_instagram ?? null;
    reachSrc = accReach != null ? 'Instagram (dedup) · Facebook indisponível' : rangeDays > 30 ? 'reach de conta só p/ janela ≤30 dias' : 'indisponível';
  }

  const viewsCard = accViews != null
    ? { label: 'Views', value: fmtInt(accViews), sublabel: viewsSrc, accent: 'primary' as const }
    : overviewCard('Views', t.views, a.views, 'primary', t.views, tp.views);
  const reachCard = accReach != null
    ? { label: 'Alcance', value: fmtInt(accReach), sublabel: reachSrc, accent: 'primary' as const }
    : { label: 'Alcance', value: accountLoading ? '…' : 'n/d', sublabel: reachSrc, accent: 'primary' as const };

  // Interações e curtidas/etc. seguem por conteúdo (media-level). Taxa usa reach de conta quando houver.
  const interactions = t.likes + t.comments + t.shares + t.saves;
  const engRate = accReach && accReach > 0 && a.likes === 'available' ? interactions / accReach : agg.engagement_rate;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard {...viewsCard} />
        <MetricCard {...reachCard} />
        <MetricCard {...overviewCard('Curtidas', t.likes, a.likes, 'success', t.likes, tp.likes)} />
        <MetricCard {...overviewCard('Comentários', t.comments, a.comments, 'success', t.comments, tp.comments)} />
        <MetricCard {...overviewCard('Compartilhamentos', t.shares, a.shares, 'success', t.shares, tp.shares)} />
        <MetricCard {...overviewCard('Salvos', t.saves, a.saves, 'success', t.saves, tp.saves)} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Conteúdos publicados" value={fmtInt(agg.content_count)} current={agg.content_count} previous={aggPrev.content_count} mono />
        <MetricCard
          label="Interações"
          value={a.likes === 'available' ? fmtInt(interactions) : 'n/d'}
          sublabel="Curtidas + coment. + compart. + salvos"
          accent="success"
        />
        <MetricCard
          label="Taxa de engajamento"
          value={engRate != null ? fmtPct(engRate * 100, 2) : '—'}
          sublabel={engRate != null ? (accReach ? 'Interações / alcance de conta' : 'Interações / alcance') : 'Requer alcance + interações'}
          accent="warning"
        />
        <MetricCard
          label="Views/conteúdo"
          value={a.views === 'available' && agg.counts.views > 0 ? fmtInt(t.views / agg.counts.views) : 'n/d'}
          sublabel={agg.counts.views > 0 ? `Base: ${fmtInt(agg.counts.views)} conteúdos c/ views` : undefined}
          mono
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Views e Alcance usam <strong>insights de nível de conta</strong> (mesma fonte do Business Suite): Views = todas as reproduções no período;
        Alcance = contas únicas (deduplicado). {rangeDays > 30 && <>O Alcance de conta só é fornecido pela Meta em janelas de até 30 dias — selecione ≤30 dias para vê-lo. </>}
        Curtidas, comentários, compartilhamentos e salvos são somados por conteúdo publicado no período.
      </p>
    </>
  );
}

// ---------------- Conteúdo (tabela) ----------------
function ContentTab({ rows, loading }: { rows: OrganicMediaRow[]; loading: boolean }) {
  const [type, setType] = useState('all');
  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.media_type).filter(Boolean))) as string[], [rows]);
  const filtered = useMemo(
    () => rows.filter((r) => type === 'all' || r.media_type === type),
    [rows, type],
  );

  if (loading) return <TableSkeleton rows={8} cols={9} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{mediaTypeLabel(t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} conteúdo{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <ContentTable rows={filtered} />
    </div>
  );
}

function ContentTable({ rows }: { rows: OrganicMediaRow[] }) {
  if (rows.length === 0) return <EmptyState title="Nenhum conteúdo" hint="Ajuste o filtro de tipo." />;
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 px-3 font-medium text-xs">Conteúdo</th>
              <th className="py-2 px-3 font-medium text-xs">Tipo</th>
              <th className="py-2 px-3 font-medium text-xs">Publicado</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Views</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Alcance</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Curtidas</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Coment.</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Compart.</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Salvos</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Eng.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const er = engagementRateOf(r);
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2.5 min-w-0 max-w-[320px]">
                      {r.thumbnail_url ? (
                        <img src={r.thumbnail_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 bg-muted" loading="lazy" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-foreground truncate">{r.caption?.trim() || <span className="text-muted-foreground italic">(sem legenda)</span>}</p>
                        {r.permalink && (
                          <a href={r.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                            Abrir <ArrowSquareOut size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="text-[10px] uppercase">{mediaTypeLabel(r.media_type)}</Badge>
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">{r.published_at ? fmtDateBR(r.published_at) : '—'}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs"><MetricCell value={r.views} hasInsights={r.has_insights} /></td>
                  <td className="py-2 px-3 text-right font-mono text-xs"><MetricCell value={r.reach} hasInsights={r.has_insights} /></td>
                  <td className="py-2 px-3 text-right font-mono text-xs"><MetricCell value={r.likes} hasInsights={r.has_insights} /></td>
                  <td className="py-2 px-3 text-right font-mono text-xs"><MetricCell value={r.comments} hasInsights={r.has_insights} /></td>
                  <td className="py-2 px-3 text-right font-mono text-xs"><MetricCell value={r.shares} hasInsights={r.has_insights} /></td>
                  <td className="py-2 px-3 text-right font-mono text-xs"><MetricCell value={r.saves} hasInsights={r.has_insights} /></td>
                  <td className="py-2 px-3 text-right font-mono text-xs">{er != null ? fmtPct(er * 100, 1) : <span className="text-muted-foreground/60" title="Requer alcance + interações">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Top conteúdos ----------------
function TopTab({ rows, loading }: { rows: OrganicMediaRow[]; loading: boolean }) {
  const [metric, setMetric] = useState<OrganicMetric>('views');
  const [type, setType] = useState('all');
  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.media_type).filter(Boolean))) as string[], [rows]);

  const ranked = useMemo(() => {
    const base = rows.filter((r) => type === 'all' || r.media_type === type);
    return topBy(base, metric, 10);
  }, [rows, metric, type]);

  if (loading) return <TableSkeleton rows={8} cols={9} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={metric} onValueChange={(v) => setMetric(v as OrganicMetric)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TOP_METRICS.map((m) => <SelectItem key={m.key} value={m.key}>Por {m.label.toLowerCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{mediaTypeLabel(t)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {ranked.length === 0 ? (
        <EmptyState title="Sem ranking" hint={`Nenhum conteúdo com "${TOP_METRICS.find((m) => m.key === metric)?.label}" disponível no período.`} />
      ) : (
        <ContentTable rows={ranked} />
      )}
    </div>
  );
}

// ---------------- Histórico ----------------
function HistoryTab({ rows, loading, range }: { rows: OrganicMediaRow[]; loading: boolean; range: { from: Date; to: Date } }) {
  const days = Math.round((range.to.getTime() - range.from.getTime()) / 86400000);
  const [gran, setGran] = useState<'day' | 'week'>(days > 45 ? 'week' : 'day');
  const data = useMemo(() => timeseries(rows, gran === 'week'), [rows, gran]);

  if (loading) return <ChartSkeleton />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Select value={gran} onValueChange={(v) => setGran(v as 'day' | 'week')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Por dia</SelectItem>
            <SelectItem value="week">Por semana</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{data.length} {gran === 'week' ? 'semanas' : 'dias'}</span>
      </div>
      <div className="rounded-md border border-border bg-card p-4">
        {data.length === 0 ? (
          <EmptyState title="Sem série no período" />
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => fmtDateBR(v)} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={64} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
                  labelFormatter={(v) => fmtDateBR(String(v))}
                  formatter={(val) => fmtInt(Number(val))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="reach" name="Alcance" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="views" name="Views" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="engagement" name="Interações" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Resumo semanal ----------------
function WeeklyTab({ rows, loading }: { rows: OrganicMediaRow[]; loading: boolean }) {
  const weeks = useMemo(() => weeklySummary(rows), [rows]);
  if (loading) return <TableSkeleton rows={6} cols={8} />;
  if (weeks.length === 0) return <EmptyState title="Sem semanas no período" />;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 px-3 font-medium text-xs">Semana (início)</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Conteúdos</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Views</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Alcance</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Curtidas</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Coment.</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Compart.</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Salvos</th>
              <th className="py-2 px-3 font-medium text-xs text-right">Interações</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.bucket} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="py-2 px-3 whitespace-nowrap">{fmtDateBR(w.bucket)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(w.count)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(w.views)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(w.reach)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(w.likes)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(w.comments)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(w.shares)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs">{fmtInt(w.saves)}</td>
                <td className="py-2 px-3 text-right font-mono text-xs font-medium">{fmtInt(w.engagement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
