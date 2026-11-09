// Visão Geral acionável: como as conversas andam (rpc_intelligence_conversations).
// Sem IA: velocidade da 1ª resposta, onde a conversa para, horário de chegada e anúncios.
// Cada bloco traz uma frase de leitura só quando há base para ela.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, SpinnerGap } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ratePercent } from '@/lib/intelligenceInsights';
import {
  formatWait, hourRangeLabel, MIN_FOR_COMPARE, sentence, slowHourRanges, SPEED_LABELS, speedInsight,
  type HourRow, type SpeedRow,
} from '@/lib/intelligenceConversations';

type Data = {
  days: number;
  conversations: number;
  no_reply: number;
  stalled_total: number;
  speed: SpeedRow[];
  hours: HourRow[];
  stalls: Array<{ text: string; conversations: number }>;
  questions: Array<{ text: string; sent: number; answered: number }>;
  ads: Array<{ ad: string; conversations: number; engaged: number; won: number }>;
  client_questions: string[] | null;
};

const PERIODS = [7, 30, 90];
const number = (v: number) => v.toLocaleString('pt-BR');
const pct = (part: number, total: number, min = 1) => {
  const r = ratePercent(part, total, min);
  return r == null ? '—' : `${r}%`;
};

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex gap-2 rounded-md bg-muted/60 p-2.5 text-xs text-foreground">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  );
}

function Meter({ label, value, percent, detail }: { label: string; value: string; percent: number; detail?: string }) {
  return (
    <li className="py-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(Math.max(percent, 1), 100)}%` }} />
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

export function IntelligenceConversations({ organizationId }: { organizationId: string }) {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['intelligence-conversations', organizationId, days],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Data | null> => {
      const { data: result, error } = await supabase.rpc(
        'rpc_intelligence_conversations' as never,
        { p_org: organizationId, p_days: days } as never,
      );
      if (error) throw error;
      return result as unknown as Data | null;
    },
  });

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Como as conversas estão andando</h2>
        <p className="text-xs text-muted-foreground">Conversas comerciais de WhatsApp que começaram no período.</p>
      </div>
      <div className="flex gap-1" role="group" aria-label="Período">
        {PERIODS.map((p) => (
          <Button key={p} type="button" size="sm" variant={p === days ? 'default' : 'outline'} aria-pressed={p === days} onClick={() => setDays(p)}>
            {p} dias
          </Button>
        ))}
      </div>
    </div>
  );

  if (isLoading) {
    return <div className="space-y-4">{header}<div className="flex justify-center py-10"><SpinnerGap className="size-5 animate-spin text-muted-foreground" /></div></div>;
  }
  if (isError || !data) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <CardContent className="flex items-center justify-between gap-3 pt-6 text-sm text-muted-foreground">
            Não foi possível carregar os dados agora.
            <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>Tentar de novo</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (data.conversations === 0) {
    return <div className="space-y-4">{header}<p className="text-sm text-muted-foreground">Nenhuma conversa nova neste período.</p></div>;
  }

  const speedHint = speedInsight(data.speed);
  const maxSpeedRate = Math.max(1, ...data.speed.map((s) => ratePercent(s.engaged, s.conversations) ?? 0));
  const slow = slowHourRanges(data.hours)[0];
  const maxHour = Math.max(1, ...data.hours.map((h) => h.conversations));
  const answerable = data.questions.filter((q) => q.sent >= 5);
  const worstQuestion = answerable.length >= 2
    ? [...answerable].sort((a, b) => a.answered / a.sent - b.answered / b.sent)[0]
    : null;
  const bestQuestion = answerable.length >= 2
    ? [...answerable].sort((a, b) => b.answered / b.sent - a.answered / a.sent)[0]
    : null;
  const topStall = data.stalls[0];

  return (
    <div className="space-y-4">
      {header}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="Conversas novas" value={number(data.conversations)} />
        <Tile
          label="Cliente não respondeu depois da 1ª mensagem"
          value={pct(data.no_reply, data.conversations)}
          hint={`${number(data.no_reply)} conversas`}
        />
        <Tile
          label="Paradas há mais de 24 h esperando o cliente"
          value={number(data.stalled_total)}
          hint="Última mensagem foi da empresa"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Velocidade da primeira resposta</CardTitle>
            <p className="text-xs text-muted-foreground">Quantas conversas seguiram até 5 mensagens do cliente, por tempo até a 1ª resposta.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {data.speed.map((s) => {
                const rate = ratePercent(s.engaged, s.conversations) ?? 0;
                return (
                  <Meter
                    key={s.bucket}
                    label={SPEED_LABELS[s.bucket] ?? '—'}
                    value={pct(s.engaged, s.conversations)}
                    percent={(rate / maxSpeedRate) * 100}
                    detail={`${number(s.conversations)} conversas`}
                  />
                );
              })}
            </ul>
            {speedHint && <Hint>{speedHint} Responder rápido é a alavanca mais simples.</Hint>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quando os leads chegam</CardTitle>
            <p className="text-xs text-muted-foreground">Conversas por hora de chegada. Mais escuro: esperou mais de 1 h pela resposta (mediana).</p>
          </CardHeader>
          <CardContent>
            <div className="flex h-24 items-end gap-0.5" role="img" aria-label="Conversas por hora de chegada">
              {Array.from({ length: 24 }, (_, hour) => {
                const row = data.hours.find((h) => h.hour === hour);
                const n = row?.conversations ?? 0;
                const late = (row?.median_minutes ?? 0) > 60;
                return (
                  <div
                    key={hour}
                    title={`${hour}h: ${number(n)} conversas${row?.median_minutes != null ? `, espera mediana de ${formatWait(row.median_minutes)}` : ''}`}
                    className={`flex-1 rounded-t-sm ${late ? 'bg-primary' : 'bg-primary/35'}`}
                    style={{ height: `${n ? Math.max((n / maxHour) * 100, 4) : 0}%` }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
            </div>
            {slow && slow.conversations >= 5 && (
              <Hint>
                {number(slow.conversations)} leads chegaram entre {hourRangeLabel(slow.from, slow.to)} e esperaram até {formatWait(slow.maxMedian)} pela primeira resposta. É o horário em que um agente de IA ou um plantão mais ajudaria.
              </Hint>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Onde a conversa parou</CardTitle>
            <p className="text-xs text-muted-foreground">Última mensagem da empresa nas conversas sem resposta há mais de 24 h.</p>
          </CardHeader>
          <CardContent>
            {data.stalls.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conversa parada neste período.</p>
            ) : (
              <ul className="space-y-2">
                {data.stalls.map((s) => (
                  <li key={s.text} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 line-clamp-2">{sentence(s.text)}</span>
                    <span className="shrink-0 font-medium tabular-nums">{number(s.conversations)}</span>
                  </li>
                ))}
              </ul>
            )}
            {topStall && topStall.conversations >= 5 && (
              <Hint>
                {number(topStall.conversations)} conversas pararam na mesma mensagem. Vale testar outra forma de dizer isso, ou um lembrete automático depois de algumas horas.
              </Hint>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perguntas que a equipe mais faz</CardTitle>
            <p className="text-xs text-muted-foreground">Quantas vezes o cliente respondeu depois de receber cada pergunta.</p>
          </CardHeader>
          <CardContent>
            {data.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há perguntas repetidas neste período.</p>
            ) : (
              <ul className="space-y-1">
                {data.questions.map((q) => (
                  <Meter
                    key={q.text}
                    label={sentence(q.text)}
                    value={pct(q.answered, q.sent)}
                    percent={ratePercent(q.answered, q.sent) ?? 0}
                    detail={`Enviada ${number(q.sent)} vezes`}
                  />
                ))}
              </ul>
            )}
            {worstQuestion && bestQuestion && worstQuestion !== bestQuestion
              && (bestQuestion.answered / bestQuestion.sent) - (worstQuestion.answered / worstQuestion.sent) >= 0.2 && (
              <Hint>
                "{sentence(worstQuestion.text).slice(0, 80)}" tem a menor taxa de resposta ({pct(worstQuestion.answered, worstQuestion.sent)}). Compare com "{sentence(bestQuestion.text).slice(0, 80)}" ({pct(bestQuestion.answered, bestQuestion.sent)}).
              </Hint>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultado por anúncio</CardTitle>
          <p className="text-xs text-muted-foreground">
            Engajou: chegou a 5 mensagens do cliente. Com menos de {MIN_FOR_COMPARE} conversas, a porcentagem não aparece.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium" scope="col">Anúncio</th>
                  <th className="px-3 py-2 text-right font-medium" scope="col">Conversas</th>
                  <th className="px-3 py-2 text-right font-medium" scope="col">Engajou</th>
                  <th className="py-2 pl-3 text-right font-medium" scope="col">Ganhos</th>
                </tr>
              </thead>
              <tbody>
                {data.ads.map((a) => (
                  <tr key={a.ad} className="border-b last:border-0">
                    <th className="max-w-[18rem] truncate py-2 pr-3 text-left font-normal" scope="row" title={a.ad}>{a.ad}</th>
                    <td className="px-3 py-2 text-right tabular-nums">{number(a.conversations)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(a.engaged, a.conversations, MIN_FOR_COMPARE)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{number(a.won)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {data.client_questions && data.client_questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que os clientes estão perguntando</CardTitle>
            <p className="text-xs text-muted-foreground">Perguntas recentes, nas palavras deles. Visível só para quem administra a organização.</p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.client_questions.map((q) => (
                <li key={q} className="rounded-md border border-border bg-card px-3 py-2 text-sm">"{q}"</li>
              ))}
            </ul>
            <Hint>Perguntas que se repetem aqui são boas candidatas para respostas prontas e para a base de conhecimento do agente.</Hint>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
