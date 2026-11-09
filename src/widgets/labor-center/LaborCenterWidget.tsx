import { useMemo, useState, type ReactNode } from 'react';
import { ArrowCounterClockwise, CaretDown, Copy, PencilSimple } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { WidgetContext } from '../types';
import {
  brl, calcularCaso, caseSummaryText, CONFIDENCE_LABEL, FACT_BY_KEY, FACTS, fmtDate, fmtNum, normalizeFact, parseNum, toDate, todayYMD,
  TERMINATION_LABEL,
  type CaseResult, type FactKey, type Facts, type PedidoKey, type PedidoResult, type Peek, type Termination,
} from './calc';
import { FactInput, type RawValue } from './ui/FactInput';
import { Check, Field, LinesCard, Notice, Row, type Tone } from './ui/fields';

type TabKey = 'rescisao' | 'horas' | 'adicionais' | 'fgts' | 'resumo';

interface TabDef {
  key: TabKey;
  label: string;
  /** Campos próprios da aba (os do contrato ficam no bloco do topo, compartilhado). */
  facts: FactKey[];
  pedidos: PedidoKey[];
}

/** Dados do contrato: compartilhados entre as abas. */
const CONTRACT: FactKey[] = ['salario', 'remuneracao_variavel', 'admissao', 'ainda_trabalha', 'quer_rescisao_indireta', 'saida', 'desligamento'];

const TABS: TabDef[] = [
  {
    key: 'rescisao', label: 'Rescisão',
    facts: ['aviso', 'rescisao_recebida', 'valor_recebido', 'rescisao_no_prazo', 'ferias_vencidas', 'saldo_fgts'],
    pedidos: ['rescisorias'],
  },
  {
    key: 'horas', label: 'Horas extras',
    facts: ['jornada_contratual', 'entrada', 'saida_expediente', 'intervalo', 'dias_semana', 'domingos_feriados', 'he_pagas', 'noturno_pago'],
    pedidos: ['horas_extras', 'intervalo', 'adicional_noturno'],
  },
  {
    key: 'adicionais', label: 'Adicionais',
    facts: ['insalubridade', 'insalubridade_paga', 'periculosidade', 'periculosidade_paga'],
    pedidos: ['insalubridade_periculosidade'],
  },
  { key: 'fgts', label: 'FGTS', facts: ['fgts_depositado', 'meses_sem_fgts'], pedidos: ['fgts'] },
  { key: 'resumo', label: 'Resumo', facts: [], pedidos: [] },
];

interface State {
  values: Partial<Record<FactKey, RawValue>>;
  unknown: Partial<Record<FactKey, boolean>>;
  filing: string;
  minimumWage: string;
  monthsOverride: string;
  exclude: PedidoKey[];
}

const initial = (): State => ({ values: {}, unknown: {}, filing: todayYMD(), minimumWage: '', monthsOverride: '', exclude: [] });

function toFacts(s: State): Facts {
  const facts: Facts = {};
  for (const def of FACTS) {
    if (s.unknown[def.key]) facts[def.key] = { status: 'nao_sabe', source: 'time' };
    else if (s.values[def.key] !== undefined && s.values[def.key] !== '') facts[def.key] = { value: s.values[def.key], source: 'time' };
  }
  return facts;
}

/** Central Trabalhista: uma aba por cálculo, dados do contrato compartilhados, resumo com o total. */
export function LaborCenterWidget(_: { context: WidgetContext }) {
  const [s, setS] = useState<State>(initial);
  const [tab, setTab] = useState<TabKey>('rescisao');

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
  const relevant = (k: FactKey) => FACT_BY_KEY.get(k)!.relevant?.(peek) ?? true;

  const setValue = (k: FactKey, v: RawValue) => setS((p) => ({ ...p, values: { ...p.values, [k]: v }, unknown: { ...p.unknown, [k]: false } }));
  const setUnknown = (k: FactKey, v: boolean) => setS((p) => ({ ...p, unknown: { ...p.unknown, [k]: v } }));
  const fields = (keys: FactKey[]) => keys.filter(relevant).map((k) => {
    const def = FACT_BY_KEY.get(k)!;
    return (
      <FactInput key={k} def={def} value={s.values[k]} unknown={!!s.unknown[k]} premise={def.premise?.(peek).label}
        onChange={(v) => setValue(k, v)} onUnknown={(v) => setUnknown(k, v)} showQuestion={false} />
    );
  });

  const current = TABS.find((t) => t.key === tab)!;
  const pendingIn = (keys: FactKey[]) => res.pending.filter((q) => keys.includes(q.key));
  const notTerminated = peek('ainda_trabalha') === true && peek('quer_rescisao_indireta') !== true;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caseSummaryText(res, peek('empresa') as string | undefined));
      toast({ title: 'Resumo copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('-mb-px flex-1 whitespace-nowrap border-b-2 px-1 pb-2 pt-1 text-xs transition-colors',
              tab === t.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'resumo' && (
        <>
          <ContractBlock res={res} peek={peek} complete={pendingIn(CONTRACT).every((q) => !q.required)}>
            {fields(CONTRACT)}
          </ContractBlock>

          {tab === 'rescisao' && notTerminated
            ? <Notice>Rescisão só vale para quem saiu da empresa ou vai pedir rescisão indireta (marque nos dados do contrato).</Notice>
            : <div className="space-y-3">{fields(current.facts)}</div>}

          {current.pedidos.map((k) => {
            const pd = res.pedidos.find((x) => x.key === k);
            return pd ? <PedidoCard key={k} pd={pd} /> : null;
          })}

          <TabPremises items={res.premises.filter((p) => !p.asked && [...CONTRACT, ...current.facts].includes(p.key))} />
          <PendingList items={pendingIn([...CONTRACT, ...current.facts])} />
        </>
      )}

      {tab === 'resumo' && <Summary res={res} s={s} setS={setS} onOpen={setTab} onCopy={copy} />}

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

/** Dados do contrato: abertos até ficarem completos, depois viram uma linha de resumo (clicar abre de novo). */
function ContractBlock({ res, peek, complete, children }: { res: CaseResult; peek: Peek; complete: boolean; children: ReactNode }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? !complete;
  const adm = toDate(peek('admissao') as string | undefined);
  const out = toDate(peek('saida') as string | undefined);
  const term = peek('desligamento') as Termination | undefined;
  const summary = [
    typeof peek('salario') === 'number' ? brl(peek('salario') as number) : null,
    adm ? `${fmtDate(adm)} → ${peek('ainda_trabalha') === true ? 'hoje' : out ? fmtDate(out) : '?'}` : null,
    peek('ainda_trabalha') === true ? 'ainda trabalha' : term ? TERMINATION_LABEL[term].toLowerCase() : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-[6px] border border-border">
      <button type="button" onClick={() => setOpen(!expanded)} className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
        <span className="min-w-0">
          <span className="block text-xs font-medium">Dados do contrato</span>
          {!expanded && <span className="block truncate text-[11px] text-muted-foreground">{summary || 'preencher'}</span>}
        </span>
        {expanded ? <CaretDown size={14} className="shrink-0 rotate-180" /> : <PencilSimple size={14} className="shrink-0 text-muted-foreground" />}
      </button>
      {expanded && <div className="space-y-3 border-t border-border p-2.5">{children}</div>}
      <div className="border-t border-border p-1.5">
        <Notice tone={eligibilityTone(res)}>{res.eligibility.message}</Notice>
      </div>
    </div>
  );
}

function PedidoCard({ pd }: { pd: PedidoResult }) {
  return (
    <div className="space-y-2 rounded-[6px] border border-border p-2.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{pd.label}</span>
        <span className={cn('font-mono', pd.status !== 'calculado' && 'text-xs text-muted-foreground')}>
          {pd.status === 'calculado' ? brl(pd.total) : pd.status === 'pendente' ? 'faltam dados' : 'nada a cobrar'}
        </span>
      </div>
      {pd.note && pd.status !== 'calculado' && <p className="text-[11px] text-muted-foreground">{pd.note}</p>}
      {pd.lines.length > 0 && pd.status !== 'calculado' && <LinesCard lines={pd.lines} total={pd.total} totalLabel={pd.status === 'pendente' ? 'Total devido' : 'A cobrar'} />}
      {pd.status === 'calculado' && (
        <>
          {pd.note && <p className="text-[11px] text-muted-foreground">{pd.note}</p>}
          <LinesCard lines={pd.lines} total={pd.total} totalLabel="A cobrar" />
          {pd.warnings.map((w) => <p key={w} className="text-[11px] text-muted-foreground">{w}</p>)}
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">Memória de cálculo</summary>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-muted-foreground">{pd.memory.join('\n')}</pre>
          </details>
        </>
      )}
    </div>
  );
}

/** Uma linha só com o que a aba está presumindo, no valor e não no nome do campo. */
function TabPremises({ items }: { items: CaseResult['premises'] }) {
  if (!items.length) return null;
  return (
    <p className="text-[11px] text-amber-700 dark:text-amber-400">
      Presumido até confirmar: {items.map((p) => p.assumed).join(', ')}.
    </p>
  );
}

function PendingList({ items }: { items: CaseResult['pending'] }) {
  if (!items.length) return null;
  return (
    <details className="rounded-[6px] border border-dashed border-border p-2.5 text-xs">
      <summary className="cursor-pointer font-medium text-muted-foreground">Perguntas para o lead ({items.length})</summary>
      <ul className="mt-2 space-y-2">
        {items.map((q) => (
          <li key={q.key}>
            <p>“{q.question}”</p>
            <p className="text-[11px] text-muted-foreground">{q.why}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Summary({ res, s, setS, onOpen, onCopy }: {
  res: CaseResult; s: State; setS: (fn: (p: State) => State) => void; onOpen: (t: TabKey) => void; onCopy: () => void;
}) {
  const tabOf = (k: PedidoKey) => TABS.find((t) => t.pedidos.includes(k))!.key;
  return (
    <div className="space-y-4">
      <Notice tone={eligibilityTone(res)}>{res.eligibility.message}</Notice>
      <div className="space-y-2 rounded-[6px] border border-border bg-muted/40 p-3">
        {res.pedidos.map((pd) => (
          <div key={pd.key} className="flex items-center justify-between gap-3 text-sm">
            {pd.status === 'calculado'
              ? <Check id={`sum-${pd.key}`} label={pd.label} checked={!s.exclude.includes(pd.key)}
                  onChange={(v) => setS((p) => ({ ...p, exclude: v ? p.exclude.filter((k) => k !== pd.key) : [...p.exclude, pd.key] }))} />
              : <span className="text-xs text-muted-foreground">{pd.label}</span>}
            <button type="button" onClick={() => onOpen(tabOf(pd.key))}
              className={cn('shrink-0 font-mono text-xs', pd.status === 'calculado' ? 'text-foreground' : 'text-muted-foreground underline')}>
              {pd.status === 'calculado' ? brl(pd.total) : pd.status === 'pendente' ? 'preencher' : '—'}
            </button>
          </div>
        ))}
        <div className="space-y-1 border-t border-border pt-2">
          <Row label="Total estimado" value={brl(res.total)} strong />
          {res.range && <Row label="Faixa" value={`${brl(res.range.low)} – ${brl(res.range.high)}`} />}
        </div>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium">{CONFIDENCE_LABEL[res.confidence]}.</span> {res.confidenceReason}
        </p>
      </div>
      {res.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      <PendingList items={res.pending} />
      <Button type="button" variant="outline" className="w-full gap-2" onClick={onCopy}>
        <Copy size={14} /> Copiar resumo do caso
      </Button>
      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">Ajustes do cálculo</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field id="lc-filing" type="date" label="Ajuizamento" hint="Hoje, se ainda não entrou." value={s.filing} onChange={(filing) => setS((p) => ({ ...p, filing }))} />
          <Field id="lc-months" label="Meses cobráveis" placeholder={res.eligibility.months ? fmtNum(res.eligibility.months, 1) : 'pelas datas'}
            hint="Só para trocar o calculado." value={s.monthsOverride} onChange={(monthsOverride) => setS((p) => ({ ...p, monthsOverride }))} />
          <Field id="lc-minwage" className="col-span-2" label="Salário mínimo (base da insalubridade)" placeholder="1.621,00"
            value={s.minimumWage} onChange={(minimumWage) => setS((p) => ({ ...p, minimumWage }))} />
        </div>
      </details>
      <Button type="button" variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground" onClick={() => setS(() => initial())}>
        <ArrowCounterClockwise size={14} /> Limpar caso
      </Button>
    </div>
  );
}
