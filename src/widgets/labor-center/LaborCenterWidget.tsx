import { useMemo, useState } from 'react';
import { ArrowCounterClockwise, Copy } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { WidgetContext } from '../types';
import {
  brl, calcularCaso, caseSummaryText, CONFIDENCE_LABEL, FACT_BY_KEY, FACT_GROUP_LABEL, FACTS, fmtNum, normalizeFact, parseNum, todayYMD,
  type CaseResult, type FactDef, type FactGroup, type FactKey, type Facts, type PedidoKey, type Peek,
} from './calc';
import { FactInput, type RawValue } from './ui/FactInput';
import { Check, Field, LinesCard, Notice, Row, Section, type Tone } from './ui/fields';

type Tab = 'ficha' | 'perguntas' | 'resultado';

interface State {
  values: Partial<Record<FactKey, RawValue>>;
  unknown: Partial<Record<FactKey, boolean>>;
  filing: string;
  minimumWage: string;
  monthsOverride: string;
  exclude: PedidoKey[];
}

const initial = (): State => ({ values: {}, unknown: {}, filing: todayYMD(), minimumWage: '', monthsOverride: '', exclude: [] });

/** Estado da tela → fatos do motor. */
function toFacts(s: State): Facts {
  const facts: Facts = {};
  for (const def of FACTS) {
    if (s.unknown[def.key]) facts[def.key] = { status: 'nao_sabe', source: 'time' };
    else if (s.values[def.key] !== undefined && s.values[def.key] !== '') facts[def.key] = { value: s.values[def.key], source: 'time' };
  }
  return facts;
}

/**
 * Central Trabalhista: ficha de fatos (o que o lead respondeu), perguntas pendentes e resultado
 * com faixa de valor. Motor em ./calc.
 */
export function LaborCenterWidget(_: { context: WidgetContext }) {
  const [s, setS] = useState<State>(initial);
  const [tab, setTab] = useState<Tab>('ficha');

  const facts = useMemo(() => toFacts(s), [s]);
  const res = useMemo(() => calcularCaso({
    facts,
    exclude: s.exclude,
    settings: {
      filingDate: s.filing,
      minimumWage: Number.isFinite(parseNum(s.minimumWage)) ? parseNum(s.minimumWage) : undefined,
      monthsOverride: Number.isFinite(parseNum(s.monthsOverride)) ? parseNum(s.monthsOverride) : null,
    },
  }), [facts, s.exclude, s.filing, s.minimumWage, s.monthsOverride]);

  const peek: Peek = (k) => (facts[k]?.status === 'nao_sabe' ? undefined : normalizeFact(FACT_BY_KEY.get(k)!, facts[k]?.value));
  const premiseOf = (def: FactDef) => def.premise?.(peek).label;

  const setValue = (k: FactKey, v: RawValue) => setS((p) => ({ ...p, values: { ...p.values, [k]: v }, unknown: { ...p.unknown, [k]: false } }));
  const setUnknown = (k: FactKey, v: boolean) => setS((p) => ({ ...p, unknown: { ...p.unknown, [k]: v } }));
  const input = (def: FactDef, showQuestion: boolean) => (
    <FactInput key={def.key} def={def} value={s.values[def.key]} unknown={!!s.unknown[def.key]} premise={premiseOf(def)}
      onChange={(v) => setValue(def.key, v)} onUnknown={(v) => setUnknown(def.key, v)} showQuestion={showQuestion} />
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caseSummaryText(res, peek('empresa') as string | undefined));
      toast({ title: 'Resumo copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ficha', label: 'Ficha' },
    { key: 'perguntas', label: `Perguntas${res.pending.length ? ` (${res.pending.length})` : ''}` },
    { key: 'resultado', label: 'Resultado' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1" role="tablist">
        {tabs.map((t) => (
          <Button key={t.key} type="button" role="tab" aria-selected={tab === t.key} size="sm"
            variant={tab === t.key ? 'default' : 'outline'} className="h-7 flex-1 px-2 text-xs" onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      <StatusBar res={res} onOpen={() => setTab('resultado')} />

      {tab === 'ficha' && (
        <>
          {(Object.keys(FACT_GROUP_LABEL) as FactGroup[]).map((g) => {
            const defs = FACTS.filter((d) => d.group === g && (d.relevant?.(peek) ?? true));
            if (!defs.length) return null;
            return <Section key={g} title={FACT_GROUP_LABEL[g]}>{defs.map((d) => input(d, false))}</Section>;
          })}
          <details className="space-y-3 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">Ajustes do cálculo</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field id="lc-filing" type="date" label="Ajuizamento" hint="Hoje, se ainda não entrou." value={s.filing} onChange={(filing) => setS((p) => ({ ...p, filing }))} />
              <Field id="lc-months" label="Meses cobráveis" placeholder={res.eligibility.months ? fmtNum(res.eligibility.months, 1) : 'pelas datas'}
                hint="Só para trocar o calculado." value={s.monthsOverride} onChange={(monthsOverride) => setS((p) => ({ ...p, monthsOverride }))} />
              <Field id="lc-minwage" className="col-span-2" label="Salário mínimo (base da insalubridade)" placeholder="1.621,00"
                value={s.minimumWage} onChange={(minimumWage) => setS((p) => ({ ...p, minimumWage }))} />
            </div>
          </details>
          <Button type="button" variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground" onClick={() => setS(initial())}>
            <ArrowCounterClockwise size={14} /> Limpar caso
          </Button>
        </>
      )}

      {tab === 'perguntas' && (
        <>
          {res.pending.length === 0
            ? <Notice tone="ok">Nada pendente: todas as perguntas que se aplicam foram respondidas.</Notice>
            : (
              <Section title="Pergunte ao lead (em ordem de impacto)">
                {res.pending.map((q) => (
                  <div key={q.key} className={cn('space-y-1 rounded-[6px] border p-2.5', q.required ? 'border-primary/40' : 'border-border')}>
                    {input(FACT_BY_KEY.get(q.key)!, true)}
                    <p className="text-[11px] text-muted-foreground">{q.required ? 'Obrigatória. ' : ''}{q.why}</p>
                  </div>
                ))}
              </Section>
            )}
          {res.premises.length > 0 && (
            <Section title="Premissas em uso (confirmar)">
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {res.premises.map((p) => (
                  <li key={p.key}><span className="font-medium text-foreground">{p.label}:</span> {p.assumed}{p.asked ? ' · lead não sabe' : ''}</li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {tab === 'resultado' && (
        <>
          <Notice tone={eligibilityTone(res)}>{res.eligibility.message}</Notice>
          <div className="space-y-1.5 rounded-[6px] border border-border bg-muted/40 p-3">
            <Row label="Total estimado" value={brl(res.total)} strong />
            {res.range && <Row label="Faixa" value={`${brl(res.range.low)} – ${brl(res.range.high)}`} />}
            <p className="pt-1 text-[11px] text-muted-foreground">
              <span className="font-medium">{CONFIDENCE_LABEL[res.confidence]}.</span> {res.confidenceReason}
            </p>
          </div>
          {res.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
          <div className="space-y-2">
            {res.pedidos.map((pd) => (
              <details key={pd.key} className="rounded-[6px] border border-border p-2.5 text-xs">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                  <span className="font-medium">{pd.label}</span>
                  <span className={cn('font-mono', pd.status !== 'calculado' && 'text-muted-foreground', !pd.included && pd.status === 'calculado' && 'line-through')}>
                    {pd.status === 'calculado' ? brl(pd.total) : pd.status === 'pendente' ? 'pendente' : '—'}
                  </span>
                </summary>
                <div className="mt-2 space-y-2">
                  {pd.note && <p className="text-muted-foreground">{pd.note}</p>}
                  {pd.missing.length > 0 && (
                    <button type="button" className="text-primary underline" onClick={() => setTab('perguntas')}>
                      Falta: {pd.missing.map((k) => FACT_BY_KEY.get(k)!.label.toLowerCase()).join(', ')}
                    </button>
                  )}
                  {pd.status === 'calculado' && (
                    <>
                      <LinesCard lines={pd.lines} total={pd.total} />
                      {pd.premises.length > 0 && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Presumido: {pd.premises.map((k) => FACT_BY_KEY.get(k)!.label.toLowerCase()).join(', ')}
                        </p>
                      )}
                      {pd.warnings.map((w) => <p key={w} className="text-[11px] text-muted-foreground">{w}</p>)}
                      <pre className="whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{pd.memory.join('\n')}</pre>
                      <Check id={`inc-${pd.key}`} label="Incluir no total" checked={!s.exclude.includes(pd.key)}
                        onChange={(v) => setS((p) => ({ ...p, exclude: v ? p.exclude.filter((k) => k !== pd.key) : [...p.exclude, pd.key] }))} />
                    </>
                  )}
                </div>
              </details>
            ))}
          </div>
          <Button type="button" variant="outline" className="w-full gap-2" onClick={copy}>
            <Copy size={14} /> Copiar resumo do caso
          </Button>
        </>
      )}

      <p className="text-[11px] text-muted-foreground">Estimativa sem correção monetária, juros, INSS e IR. Não substitui o cálculo de liquidação.</p>
    </div>
  );
}

function eligibilityTone(res: CaseResult): Tone {
  const e = res.eligibility;
  if (e.status === 'prescrito' || e.error) return 'danger';
  if (e.status === 'incompleto') return 'muted';
  return e.daysLeft != null && e.daysLeft <= 90 ? 'warn' : 'ok';
}

/** Linha fixa no topo: prazo + total + confiança, visível em qualquer aba. */
function StatusBar({ res, onOpen }: { res: CaseResult; onOpen: () => void }) {
  const e = res.eligibility;
  const tone = eligibilityTone(res);
  const prazo = e.status === 'prescrito' ? 'Prescrito'
    : e.status === 'ativo' ? 'Contrato ativo'
    : e.status === 'no_prazo' ? `Prazo: ${e.daysLeft} dias`
    : 'Prazo: faltam datas';
  return (
    <button type="button" onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 rounded-[6px] border border-border px-2.5 py-1.5 text-left text-[11px]">
      <span className={cn(
        tone === 'danger' && 'text-destructive', tone === 'warn' && 'text-amber-700 dark:text-amber-400',
        tone === 'ok' && 'text-emerald-700 dark:text-emerald-400', tone === 'muted' && 'text-muted-foreground')}>{prazo}</span>
      <span className="font-mono text-foreground">{res.range ? `${brl(res.range.low)} – ${brl(res.range.high)}` : '—'}</span>
      <span className="text-muted-foreground">{CONFIDENCE_LABEL[res.confidence]}</span>
    </button>
  );
}
