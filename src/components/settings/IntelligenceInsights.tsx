// Visão Geral da Seialz Intelligence: o que os clientes dizem e o que separa negócios ganhos de
// perdidos. Agregados de rpc_intelligence_insights, sem dado pessoal.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SpinnerGap } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MIN_DEALS_FOR_RATE, OBJECTION_LABELS, ratePercent, stageRows, type StageRow } from '@/lib/intelligenceInsights';

type Outcome = { deals: number; with_objection: number; with_signal: number; messages: number | null; days_to_close: number | null };
type Insights = {
  days: number;
  totals: { analyzed: number; objections: number; signals: number; negative: number };
  objections: Array<{ type: string; count: number; closed_deals: number; won_deals: number }>;
  objection_labels?: Record<string, string>;
  stages: StageRow[];
  outcomes: { won?: Outcome; lost?: Outcome };
  reprocessing: number;
};

const PERIODS = [7, 30, 90];
// Com poucos negócios fechados, a comparação engana mais do que ajuda.
const MIN_CLOSED_FOR_TABLE = 10;
const number = (v: number) => v.toLocaleString('pt-BR');

function Bar({ label, value, percent, detail, title }: { label: string; value: string; percent: number; detail?: string; title: string }) {
  return (
    <li title={title} className="rounded-sm py-1 hover:bg-muted/50">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(percent, 1)}%` }} />
      </div>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </li>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function OutcomeTable({ won, lost }: { won?: Outcome; lost?: Outcome }) {
  const percent = (o: Outcome | undefined, part: keyof Outcome) => {
    const rate = o ? ratePercent(Number(o[part]) || 0, o.deals, MIN_DEALS_FOR_RATE) : null;
    return rate == null ? '—' : `${rate}%`;
  };
  const avg = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR'));
  const rows: Array<[string, string, string]> = [
    ['Negócios', number(won?.deals ?? 0), number(lost?.deals ?? 0)],
    ['Com sinal de compra', percent(won, 'with_signal'), percent(lost, 'with_signal')],
    ['Com objeção', percent(won, 'with_objection'), percent(lost, 'with_objection')],
    ['Mensagens do cliente (média)', avg(won?.messages), avg(lost?.messages)],
    ['Dias até fechar (média)', avg(won?.days_to_close), avg(lost?.days_to_close)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium" scope="col"><span className="sr-only">Indicador</span></th>
            <th className="px-3 py-2 text-right font-medium" scope="col">Ganhos</th>
            <th className="py-2 pl-3 text-right font-medium" scope="col">Perdidos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b]) => (
            <tr key={label} className="border-b last:border-0">
              <th className="py-2 pr-3 text-left font-normal" scope="row">{label}</th>
              <td className="px-3 py-2 text-right tabular-nums">{a}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IntelligenceInsights({ organizationId }: { organizationId: string }) {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['intelligence-insights', organizationId, days],
    staleTime: 60_000,
    queryFn: async (): Promise<Insights | null> => {
      const { data: result, error } = await supabase.rpc(
        'rpc_intelligence_insights' as never,
        { p_org: organizationId, p_days: days } as never,
      );
      if (error) throw error;
      return result as unknown as Insights | null;
    },
  });

  const periodPicker = (
    <div className="flex gap-1" role="group" aria-label="Período">
      {PERIODS.map((p) => (
        <Button key={p} type="button" size="sm" variant={p === days ? 'default' : 'outline'} aria-pressed={p === days} onClick={() => setDays(p)}>
          {p} dias
        </Button>
      ))}
    </div>
  );

  if (isLoading) {
    return <div className="flex justify-center py-10"><SpinnerGap className="size-5 animate-spin text-muted-foreground" /></div>;
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-6 text-sm text-muted-foreground">
          Não foi possível carregar os dados agora.
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>Tentar de novo</Button>
        </CardContent>
      </Card>
    );
  }

  const stages = stageRows(data.stages);
  const maxObjection = data.objections[0]?.count ?? 0;
  const maxStage = Math.max(0, ...stages.map((s) => s.percent));
  const signalRate = ratePercent(data.totals.signals, data.totals.analyzed);
  const closedDeals = (data.outcomes.won?.deals ?? 0) + (data.outcomes.lost?.deals ?? 0);
  const hasDeals = closedDeals >= MIN_CLOSED_FOR_TABLE;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">O que seus clientes estão dizendo (análise por IA)</h2>
        {periodPicker}
      </div>

      {data.reprocessing > 0 && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Reprocessando {number(data.reprocessing)} áudios antigos com a transcrição. Os números vão ficando mais completos até terminar.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Mensagens de clientes analisadas" value={number(data.totals.analyzed)} />
        <Tile label="Sinais de compra" value={number(data.totals.signals)} hint={signalRate == null ? undefined : `${signalRate}% das mensagens`} />
        <Tile label="Objeções" value={number(data.totals.objections)} />
        <Tile label="Mensagens com tom negativo" value={number(data.totals.negative)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Principais objeções</CardTitle></CardHeader>
          <CardContent>
            {data.objections.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma objeção identificada neste período.</p>
            ) : (
              <ul className="space-y-1">
                {data.objections.map((o) => {
                  const label = data.objection_labels?.[o.type] ?? OBJECTION_LABELS[o.type] ?? OBJECTION_LABELS.other;
                  const winRate = ratePercent(o.won_deals, o.closed_deals, MIN_DEALS_FOR_RATE);
                  return (
                    <Bar
                      key={o.type}
                      label={label}
                      value={number(o.count)}
                      percent={maxObjection ? (o.count / maxObjection) * 100 : 0}
                      detail={winRate == null ? undefined : `${winRate}% dos ${number(o.closed_deals)} negócios fechados com essa objeção foram ganhos`}
                      title={`${label}: ${number(o.count)} mensagens`}
                    />
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sinais de compra por etapa</CardTitle>
            <p className="text-xs text-muted-foreground">Em quantas mensagens de cada etapa o cliente demonstrou interesse.</p>
          </CardHeader>
          <CardContent>
            {stages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há mensagens analisadas neste período.</p>
            ) : (
              <ul className="space-y-1">
                {stages.map((s) => (
                  <Bar
                    key={s.stage}
                    label={s.label}
                    value={`${s.percent}%`}
                    percent={maxStage ? (s.percent / maxStage) * 100 : 0}
                    title={`${s.label}: ${number(s.signals)} sinais em ${number(s.messages)} mensagens`}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ganhos x perdidos</CardTitle>
          <p className="text-xs text-muted-foreground">Negócios fechados no período. Com menos de {MIN_DEALS_FOR_RATE} negócios, a porcentagem não aparece.</p>
        </CardHeader>
        <CardContent>
          {hasDeals
            ? <OutcomeTable won={data.outcomes.won} lost={data.outcomes.lost} />
            : <p className="text-sm text-muted-foreground">
                {closedDeals === 0 ? 'Nenhum negócio fechado neste período.' : `Só ${number(closedDeals)} negócios fechados neste período. A comparação aparece a partir de ${MIN_CLOSED_FOR_TABLE}, marcando ganhos e perdidos no funil.`}
              </p>}
        </CardContent>
      </Card>
    </div>
  );
}
