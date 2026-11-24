// Monta a árvore Origem › campanha › conjunto › anúncio a partir das linhas de rpc_origin_report_v1.
export interface OriginReportRow {
  origin_code: string | null; origin_name: string | null; campaign_id: string | null;
  campaign_name: string | null; adset_name: string | null; ad_name: string | null; thumbnail: string | null;
  leads: number; won: number; revenue: number; spend: number;
}
export interface Totals { leads: number; won: number; revenue: number; spend: number }
export interface ReportNode extends Totals { key: string; label: string; level: 0 | 1 | 2 | 3; thumbnail?: string | null; children: ReportNode[] }

const add = (t: Totals, r: Totals) => { t.leads += r.leads; t.won += r.won; t.revenue += Number(r.revenue) || 0; t.spend += Number(r.spend) || 0; };
const empty = (): Totals => ({ leads: 0, won: 0, revenue: 0, spend: 0 });

export function buildOriginTree(rows: OriginReportRow[], labels: { unknown: string; noCampaign: string; noAdset: string }): { nodes: ReportNode[]; total: Totals } {
  const total = empty();
  const origins = new Map<string, ReportNode>();
  const child = (parent: ReportNode, key: string, label: string, level: 1 | 2 | 3) => {
    let n = parent.children.find((c) => c.key === key);
    if (!n) { n = { key, label, level, ...empty(), children: [] }; parent.children.push(n); }
    return n;
  };
  for (const r of rows) {
    add(total, r);
    const okey = r.origin_code ?? '_unknown';
    let o = origins.get(okey);
    if (!o) { o = { key: okey, label: r.origin_name ?? labels.unknown, level: 0, ...empty(), children: [] }; origins.set(okey, o); }
    add(o, r);
    // Origem sem campanha (orgânico, indicação…) não abre detalhe.
    if (!r.campaign_id && !['meta_ads', 'google_ads'].includes(okey)) continue;
    const c = child(o, `${okey}|${r.campaign_name ?? ''}`, r.campaign_name ?? labels.noCampaign, 1);
    add(c, r);
    if (!r.campaign_id) continue;
    const s = child(c, `${c.key}|${r.adset_name ?? ''}`, r.adset_name ?? labels.noAdset, 2);
    add(s, r);
    const a = child(s, `${s.key}|${r.campaign_id}`, r.ad_name ?? r.campaign_name ?? labels.noCampaign, 3);
    a.thumbnail = r.thumbnail;
    add(a, r);
  }
  const sort = (ns: ReportNode[]) => { ns.sort((x, y) => y.spend - x.spend || y.won - x.won || y.leads - x.leads); ns.forEach((n) => sort(n.children)); };
  const nodes = [...origins.values()];
  sort(nodes);
  // Não identificado sempre por último.
  nodes.sort((x, y) => (x.key === '_unknown' ? 1 : 0) - (y.key === '_unknown' ? 1 : 0));
  return { nodes, total };
}

export const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);
