import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toISODate } from '../_lib/format';

// Métricas orgânicas expostas pela view vw_meta_media_performance.
export type OrganicMetric = 'views' | 'reach' | 'likes' | 'comments' | 'shares' | 'saves' | 'impressions' | 'engagement';

export interface OrganicMediaRow {
  id: string;
  platform: string | null;
  media_type: string | null;
  external_id: string | null;
  permalink: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  reach: number | null;
  impressions: number | null;
  views: number | null;
  engagement: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  has_insights: boolean | null;
}

const COLS = 'id,platform,media_type,external_id,permalink,caption,thumbnail_url,published_at,reach,impressions,views,engagement,likes,comments,shares,saves,has_insights';

// Seletor de origem: Instagram / Facebook / combinado.
export type PlatformFilter = 'instagram' | 'facebook' | 'all';

// 1 query por período+plataforma — reutilizada por todas as sub-abas.
export function useOrganicMedia(orgId?: string, from?: Date, to?: Date, platform: PlatformFilter = 'all') {
  const fromIso = from ? toISODate(from) : undefined;
  const toIso = to ? toISODate(to) : undefined;
  return useQuery({
    queryKey: ['marketing', 'organic', 'media', orgId, fromIso, toIso, platform],
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from('vw_meta_media_performance')
        .select(COLS)
        .eq('organization_id', orgId!);
      if (platform !== 'all') q = q.eq('platform', platform);
      if (fromIso) q = q.gte('published_at', fromIso);
      if (toIso) q = q.lte('published_at', `${toIso}T23:59:59`);
      const { data, error } = await q.order('published_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as OrganicMediaRow[];
    },
  });
}

// Insights de NÍVEL DE CONTA (semântica do Business Suite: reach dedup, views totais).
// On-demand via edge function; usado só no Overview. Media-level continua no conteúdo.
export interface AccountInsights {
  instagram: { reach: number | null; views: number | null; available: boolean; reach_window_limit_days?: number };
  facebook: { reach: number | null; views: number | null; followers: number | null; available: boolean; reach_window_limit_days?: number };
  combined: { views: number; reach_instagram: number | null; reach_facebook: number | null; views_available: boolean };
}
export function useAccountInsights(orgId?: string, from?: Date, to?: Date) {
  const fromIso = from ? toISODate(from) : undefined;
  const toIso = to ? toISODate(to) : undefined;
  return useQuery({
    queryKey: ['marketing', 'organic', 'account', orgId, fromIso, toIso],
    enabled: !!orgId && !!fromIso && !!toIso,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<AccountInsights | null> => {
      const { data, error } = await supabase.functions.invoke('meta-account-insights', {
        body: { organization_id: orgId, since: fromIso, until: toIso },
      });
      if (error) return null; // best-effort: Overview cai p/ media-level se indisponível
      return data as AccountInsights;
    },
  });
}

// ---- helpers puros (agregação client-side; sem tocar payload cru) ----

export type Availability = 'available' | 'unavailable' | 'not_synced';

// Disponibilidade de UMA métrica no conjunto: se nenhuma linha tem insights → not_synced;
// se há insights mas a coluna é sempre NULL → unavailable (API não fornece); senão available.
export function metricAvailability(rows: OrganicMediaRow[], metric: OrganicMetric): Availability {
  if (!rows.length) return 'not_synced';
  const anyInsights = rows.some((r) => r.has_insights);
  if (!anyInsights) return 'not_synced';
  const anyValue = rows.some((r) => r[metric] != null);
  return anyValue ? 'available' : 'unavailable';
}

export interface OrganicAggregate {
  content_count: number;
  totals: Record<OrganicMetric, number>;
  counts: Record<OrganicMetric, number>; // nº de conteúdos com a métrica presente (divisor honesto de médias)
  availability: Record<OrganicMetric, Availability>;
  engagement_rate: number | null; // interações / reach quando calculável
}

const METRICS: OrganicMetric[] = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'impressions', 'engagement'];

export function aggregate(rows: OrganicMediaRow[]): OrganicAggregate {
  const totals = {} as Record<OrganicMetric, number>;
  const counts = {} as Record<OrganicMetric, number>;
  const availability = {} as Record<OrganicMetric, Availability>;
  for (const m of METRICS) {
    totals[m] = rows.reduce((s, r) => s + (r[m] ?? 0), 0);
    counts[m] = rows.reduce((s, r) => s + (r[m] != null ? 1 : 0), 0);
    availability[m] = metricAvailability(rows, m);
  }
  const interactions = (['likes', 'comments', 'shares', 'saves'] as OrganicMetric[])
    .filter((m) => availability[m] === 'available')
    .reduce((s, m) => s + totals[m], 0);
  const engagement_rate =
    availability.reach === 'available' && totals.reach > 0 && availability.likes === 'available'
      ? interactions / totals.reach
      : null;
  return { content_count: rows.length, totals, counts, availability, engagement_rate };
}

// interações por mídia (só métricas disponíveis)
export function interactionsOf(r: OrganicMediaRow): number {
  return (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.saves ?? 0);
}
export function engagementRateOf(r: OrganicMediaRow): number | null {
  return r.reach && r.reach > 0 ? interactionsOf(r) / r.reach : null;
}

// Série temporal por dia (ou semana ISO se o intervalo for longo), somando por data de publicação.
export interface TimeBucket {
  bucket: string; // YYYY-MM-DD (início do dia/semana)
  reach: number; views: number; engagement: number; count: number;
}
function isoWeekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (x.getUTCDay() + 6) % 7; // segunda=0
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}
export function timeseries(rows: OrganicMediaRow[], weekly: boolean): TimeBucket[] {
  const map = new Map<string, TimeBucket>();
  for (const r of rows) {
    if (!r.published_at) continue;
    const d = new Date(r.published_at);
    const key = weekly ? toISODate(isoWeekStart(d)) : toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    const b = map.get(key) ?? { bucket: key, reach: 0, views: 0, engagement: 0, count: 0 };
    b.reach += r.reach ?? 0;
    b.views += r.views ?? 0;
    b.engagement += interactionsOf(r);
    b.count += 1;
    map.set(key, b);
  }
  return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export function topBy(rows: OrganicMediaRow[], metric: OrganicMetric, n = 10): OrganicMediaRow[] {
  return [...rows]
    .filter((r) => r[metric] != null)
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))
    .slice(0, n);
}

// Resumo semanal (reproduz a planilha manual): por semana ISO → totais + nº de conteúdos.
export interface WeeklyRow extends TimeBucket {
  likes: number; comments: number; shares: number; saves: number;
}
export function weeklySummary(rows: OrganicMediaRow[]): WeeklyRow[] {
  const map = new Map<string, WeeklyRow>();
  for (const r of rows) {
    if (!r.published_at) continue;
    const key = toISODate(isoWeekStart(new Date(r.published_at)));
    const w = map.get(key) ?? { bucket: key, reach: 0, views: 0, engagement: 0, count: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
    w.reach += r.reach ?? 0; w.views += r.views ?? 0; w.engagement += interactionsOf(r); w.count += 1;
    w.likes += r.likes ?? 0; w.comments += r.comments ?? 0; w.shares += r.shares ?? 0; w.saves += r.saves ?? 0;
    map.set(key, w);
  }
  return Array.from(map.values()).sort((a, b) => b.bucket.localeCompare(a.bucket));
}
