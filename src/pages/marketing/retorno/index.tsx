// Origem das vendas: leads, vendas, receita e gasto por Origem, abrindo campanha › conjunto › anúncio.
import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { MarketingLayout } from '../_components/MarketingLayout';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildOriginTree, ratio, type OriginReportRow, type ReportNode } from '@/lib/originReport';

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function period(value: string): { from: string; to: string } {
  const today = new Date();
  if (value === 'month') return { from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDay(today) };
  if (value === 'last_month') {
    return { from: isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: isoDay(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  const from = new Date(today); from.setDate(from.getDate() - Number(value) + 1);
  return { from: isoDay(from), to: isoDay(today) };
}

export default function MarketingRetorno() {
  useUiLocale();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.default_currency || 'BRL';
  const [range, setRange] = useState('30');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { from, to } = period(range);
  const { data, isLoading, error } = useQuery({
    queryKey: ['origin-report', orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_origin_report_v1' as never, { p_org: orgId, p_from: from, p_to: to } as never);
      if (error) throw error;
      return (data ?? []) as unknown as OriginReportRow[];
    },
  });
  const tree = useMemo(() => buildOriginTree(data ?? [], {
    unknown: uiText('Não identificado'), noCampaign: uiText('Sem campanha identificada'), noAdset: uiText('Sem conjunto'),
  }), [data]);
  const money = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }), [currency]);
  const m = (v: number | null) => (v === null ? '—' : money.format(v));
  const toggle = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const cells = (n: { leads: number; won: number; revenue: number; spend: number }) => {
    const conv = ratio(n.won, n.leads);
    const roas = ratio(n.revenue, n.spend);
    return (
      <>
        <td className="py-2 pr-3 text-right tabular-nums">{n.leads}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{n.won}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{conv === null ? '—' : `${Math.round(conv * 100)}%`}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{n.revenue > 0 ? m(n.revenue) : '—'}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{n.spend > 0 ? m(n.spend) : '—'}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{n.spend > 0 ? m(ratio(n.spend, n.leads)) : '—'}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{n.spend > 0 ? m(ratio(n.spend, n.won)) : '—'}</td>
        <td className="py-2 text-right tabular-nums font-medium">{roas === null || n.revenue <= 0 ? '—' : `${roas.toFixed(1)}x`}</td>
      </>
    );
  };

  const renderNode = (n: ReportNode): JSX.Element => {
    const expandable = n.children.length > 0;
    const expanded = open.has(n.key);
    return (
      <Fragment key={n.key}>
        <tr className={`border-b ${expandable ? 'cursor-pointer hover:bg-muted/40' : ''} ${n.level === 0 ? 'font-medium' : 'text-xs'}`}
          onClick={expandable ? () => toggle(n.key) : undefined}>
          <td className="py-2 pr-3">
            <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: n.level * 16 }}>
              {expandable ? (expanded ? <CaretDown className="h-3.5 w-3.5 shrink-0" /> : <CaretRight className="h-3.5 w-3.5 shrink-0" />) : <span className="w-3.5 shrink-0" />}
              {n.thumbnail && <img src={n.thumbnail} alt="" className="h-6 w-6 shrink-0 rounded object-cover" loading="lazy" />}
              <span className="truncate" title={n.label}>{n.label}</span>
            </div>
          </td>
          {cells(n)}
        </tr>
        {expanded && n.children.map(renderNode)}
      </Fragment>
    );
  };

  return (
    <MarketingLayout title={uiText('Origem das vendas')}>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            {uiText('De onde vieram os leads e as vendas do período, quanto custou e quanto voltou. Leads contam pela data de entrada; vendas, pela data em que foram ganhas. Clique numa origem paga para abrir campanha, conjunto e anúncio.')}
          </p>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{uiText('Últimos 7 dias')}</SelectItem>
              <SelectItem value="30">{uiText('Últimos 30 dias')}</SelectItem>
              <SelectItem value="90">{uiText('Últimos 90 dias')}</SelectItem>
              <SelectItem value="month">{uiText('Este mês')}</SelectItem>
              <SelectItem value="last_month">{uiText('Mês passado')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">{uiText('Carregando...')}</p>
          : error ? <p className="text-sm text-destructive">{uiText('Não foi possível carregar o relatório.')}</p>
          : tree.nodes.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{uiText('Nenhum lead, venda ou gasto no período.')}</p>
          : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">{uiText('Origem')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{uiText('Leads')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{uiText('Vendas')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{uiText('Conversão')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{uiText('Receita')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{uiText('Gasto')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{uiText('Custo por lead')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{uiText('Custo por venda')}</th>
                  <th className="py-2 text-right font-medium">{uiText('Retorno')}</th>
                </tr>
              </thead>
              <tbody>
                {tree.nodes.map(renderNode)}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">{uiText('Total')}</td>
                  {cells(tree.total)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {uiText('Retorno = receita das vendas ÷ gasto. Aparece só quando as vendas têm valor preenchido. O gasto vem das contas de anúncio conectadas.')}
        </p>
      </Card>
    </MarketingLayout>
  );
}
