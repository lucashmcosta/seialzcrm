/**
 * Motor do caso trabalhista: fatos → elegibilidade, pedidos, faixa de valor, premissas e perguntas.
 * Puro (sem I/O).
 */
import { fmtDate, monthsReal, toDate, todayYMD } from './dates';
import { FACTS, FACT_BY_KEY, type FactDef, type FactKey, type Facts, type InsalubrityAnswer, type FgtsDeposited, type SeverancePaid, type Peek } from './facts';
import { parseTime, scheduleHours, type ScheduleHours } from './jornada';
import { brl, fmtNum, parseNum } from './money';
import { calcPrescription, defaultNotice, FGTS_FINE_RATE, type NoticeKind, type PrescriptionStatus, type Termination } from './prescription';
import { breakMonthly, calcAllowance, nightMonthly, overtimeMonthly, type InsalubrityGrade } from './rates';
import { withReflexes, type Line } from './reflexes';
import { calcSeverance } from './severance';

/** Salário mínimo nacional vigente (Decreto 12.797/2025). Atualizar a cada decreto anual. */
export const MINIMUM_WAGE = 1621;

/**
 * Margem da faixa de valor por confiança. Valores iniciais, A CALIBRAR com casos reais
 * (comparar estimativa × liquidação/acordo).
 */
export const ESTIMATE_BANDS = { completo: [0.85, 1.15], parcial: [0.6, 1.3] } as const;

export type PedidoKey = 'horas_extras' | 'intervalo' | 'adicional_noturno' | 'insalubridade_periculosidade' | 'rescisorias' | 'fgts';
export type PedidoStatus = 'calculado' | 'sem_direito' | 'pendente';
export type Confidence = 'insuficiente' | 'parcial' | 'completo';

export const PEDIDO_LABEL: Record<PedidoKey, string> = {
  horas_extras: 'Horas extras',
  intervalo: 'Intervalo de almoço',
  adicional_noturno: 'Adicional noturno',
  insalubridade_periculosidade: 'Insalubridade / periculosidade',
  rescisorias: 'Verbas rescisórias',
  fgts: 'FGTS não depositado',
};

export interface CaseSettings {
  /** Data do ajuizamento (YYYY-MM-DD). Padrão: hoje. */
  filingDate?: string;
  minimumWage?: number;
  dsrWorkdays?: number;
  dsrRestDays?: number;
  /** Meses cobráveis à mão (substitui o período da prescrição). */
  monthsOverride?: number | null;
}

export interface CaseInput {
  facts: Facts;
  settings?: CaseSettings;
  /** Pedidos fora do total. Padrão: todos dentro. */
  exclude?: PedidoKey[];
}

export interface PremiseUsed {
  key: FactKey;
  label: string;
  /** Valor presumido, em texto. */
  assumed: string;
  /** true = o lead disse que não sabe; false = ainda não foi perguntado. */
  asked: boolean;
  impact: 1 | 2 | 3;
}

export interface PendingQuestion {
  key: FactKey;
  label: string;
  question: string;
  why: string;
  required: boolean;
  impact: 1 | 2 | 3;
  kind: FactDef['kind'];
  options?: { value: string; label: string }[];
}

export interface PedidoResult {
  key: PedidoKey;
  label: string;
  status: PedidoStatus;
  total: number;
  lines: Line[];
  memory: string[];
  /** Fatos presumidos que afetam este pedido. */
  premises: FactKey[];
  /** Fatos que faltam para calcular (status pendente). */
  missing: FactKey[];
  note?: string;
  warnings: string[];
  included: boolean;
}

export interface Eligibility {
  status: PrescriptionStatus;
  message: string;
  deadline: string | null;
  daysLeft: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  months: number;
  noticeDays: number;
  error?: string;
}

export interface CaseResult {
  eligibility: Eligibility;
  pedidos: PedidoResult[];
  total: number;
  range: { low: number; high: number } | null;
  confidence: Confidence;
  confidenceReason: string;
  pending: PendingQuestion[];
  premises: PremiseUsed[];
  warnings: string[];
  hourly: number | null;
  schedule: ScheduleHours | null;
}

// ---------------------------------------------------------------- leitura dos fatos

/** Valor válido para o tipo do fato, ou undefined. Aceita strings digitadas (texto) e valores tipados. */
export function normalizeFact(def: FactDef, raw: unknown): unknown {
  if (raw == null || raw === '') return undefined;
  switch (def.kind) {
    case 'money': case 'number': case 'int': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseNum(raw) : NaN;
      if (!Number.isFinite(n) || n < 0) return undefined;
      return def.kind === 'int' ? Math.round(n) : n;
    }
    case 'date': return typeof raw === 'string' && toDate(raw) ? raw : undefined;
    case 'time': return parseTime(raw) != null ? raw : undefined;
    case 'bool':
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') {
        const s = raw.trim().toLowerCase();
        if (['true', 'sim', 's'].includes(s)) return true;
        if (['false', 'nao', 'não', 'n'].includes(s)) return false;
      }
      return undefined;
    case 'enum': return typeof raw === 'string' && def.options?.some((o) => o.value === raw) ? raw : undefined;
    case 'text': return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  }
}

function describe(def: FactDef, v: unknown): string {
  if (def.kind === 'enum') return def.options?.find((o) => o.value === v)?.label ?? String(v);
  if (def.kind === 'bool') return v ? 'sim' : 'não';
  if (def.kind === 'money') return brl(v as number);
  if (def.kind === 'date') return fmtDate(toDate(v as string)!);
  return String(v);
}

function makeReader(facts: Facts) {
  const confirmed: Peek = (k) => {
    const e = facts[k];
    if (!e || e.status === 'nao_sabe') return undefined;
    return normalizeFact(FACT_BY_KEY.get(k)!, e.value);
  };
  const premises = new Map<FactKey, PremiseUsed>();
  /** Valor confirmado ou premissa. Registra a premissa em `sink` (pedido) e no total do caso. */
  const get = <T>(k: FactKey, sink?: Set<FactKey>): T | undefined => {
    const v = confirmed(k);
    if (v !== undefined) return v as T;
    const def = FACT_BY_KEY.get(k)!;
    if (!def.premise) return undefined;
    const p = def.premise(confirmed);
    premises.set(k, { key: k, label: def.label, assumed: p.label, asked: facts[k]?.status === 'nao_sabe', impact: def.impact });
    sink?.add(k);
    return p.value as T;
  };
  const asked = (k: FactKey) => confirmed(k) !== undefined || facts[k]?.status === 'nao_sabe';
  return { confirmed, get, asked, premises };
}

// ---------------------------------------------------------------- motor

export function calcularCaso(input: CaseInput): CaseResult {
  const { facts, settings = {}, exclude = [] } = input;
  const r = makeReader(facts);
  const warnings: string[] = [];
  const base = new Set<FactKey>();

  const filing = toDate(settings.filingDate) ?? toDate(todayYMD())!;
  const minimumWage = settings.minimumWage ?? MINIMUM_WAGE;

  // Contrato
  const salary = r.get<number>('salario') ?? NaN;
  const variable = r.get<number>('remuneracao_variavel', base) ?? 0;
  const admission = toDate(r.get<string>('admissao'));
  const stillWorking = r.get<boolean>('ainda_trabalha');
  const indirect = stillWorking === true && r.get<boolean>('quer_rescisao_indireta') === true;
  const exitTyped = stillWorking === false ? toDate(r.get<string>('saida')) : null;
  const termination: Termination | undefined = indirect ? 'rescisao_indireta' : stillWorking === false ? r.get<Termination>('desligamento') : undefined;
  const ended = indirect || (stillWorking === false && !!exitTyped);
  const exit = exitTyped ?? (indirect ? filing : null);
  const notice: NoticeKind | undefined = !termination ? undefined
    : termination === 'justa_causa' ? 'nao_houve'
    : indirect ? 'indenizado'
    : (r.get<NoticeKind>('aviso') ?? defaultNotice(termination));

  // Elegibilidade
  const missingRequired = FACTS.filter((d) => d.required?.(r.confirmed) && !r.asked(d.key)).map((d) => d.key);
  const p = calcPrescription({ admission, exit: exitTyped, filing, termination: termination ?? 'sem_justa_causa', notice });
  const knowsExit = stillWorking === true || (stillWorking === false && !!exitTyped && !!termination);
  const eligibility = eligibilityOf(p, knowsExit && !!admission);

  const monthsManual = settings.monthsOverride != null && settings.monthsOverride >= 0;
  const months = monthsManual ? settings.monthsOverride! : eligibility.status === 'incompleto' ? 0 : p.months;
  const prescribed = eligibility.status === 'prescrito';

  // Base da hora
  const contractual = r.get<number>('jornada_contratual', base) ?? 44;
  const divisor = contractual * 5;
  const insal = r.get<InsalubrityAnswer>('insalubridade', base) ?? 'nao';
  const grade: InsalubrityGrade = insal === 'nao' ? 0 : insal === 'sim_sem_grau' ? 20 : (Number(insal) as InsalubrityGrade);
  if (insal === 'sim_sem_grau') warnings.push('Insalubridade sem grau definido: usado o grau médio (20%) até a perícia.');
  const hazard = r.get<boolean>('periculosidade', base) ?? false;
  const remuneration = (salary > 0 ? salary : 0) + variable;
  const allowance = calcAllowance({ salary: salary > 0 ? salary : 0, minimumWage, insalubrity: grade, hazard });
  if (allowance.bothSelected) warnings.push('Insalubridade e periculosidade não se acumulam (TST, Tema 17): usado o maior.');
  const hourly = salary > 0 && divisor > 0 ? (remuneration + allowance.value) / divisor : NaN;

  const work = settings.dsrWorkdays ?? 25;
  const rest = settings.dsrRestDays ?? 5;
  const dsrRate = work > 0 ? rest / work : 0;
  const fineRate = ended && termination ? FGTS_FINE_RATE[termination] : 0;

  // Jornada
  const start = parseTime(r.get('entrada'));
  const end = parseTime(r.get('saida_expediente'));
  const days = r.get<number>('dias_semana');
  const sched = new Set<FactKey>();
  const breakMin = r.get<number>('intervalo', sched) ?? 60;
  const schedule = start != null && end != null && days != null && days > 0
    ? scheduleHours({
        schedule: { start, end, breakMinutes: breakMin, daysPerWeek: days },
        contractualWeekly: contractual,
        restDaysWorkedPerMonth: r.get<number>('domingos_feriados', sched) ?? 0,
        paidOvertimePerMonth: r.get<number>('he_pagas', sched) ?? 0,
      })
    : null;
  const scheduleMissing = (['entrada', 'saida_expediente', 'dias_semana'] as FactKey[]).filter((k) => r.confirmed(k) === undefined);

  // Pedidos
  const pedidos: PedidoResult[] = [];
  const hourlyMemo = () => {
    const parts = [brl(salary)];
    if (variable) parts.push(`${brl(variable)} variável`);
    if (allowance.value) parts.push(`${brl(allowance.value)} ${allowance.applied === 'hazard' ? 'periculosidade' : 'insalubridade'}`);
    return `Hora normal = (${parts.join(' + ')}) ÷ ${fmtNum(divisor)} = ${brl(hourly)}`;
  };
  const monthsMemo = () => `Período: ${fmtNum(months, 1)} meses${monthsManual ? ' (informado à mão)' : ''}`;
  const reflexCommon = { months, toggles: { dsr: true, decimo: true, ferias: true, fgts: true }, dsrReflexShare: p.dsrReflexShare, fineRate };

  const push = (key: PedidoKey, o: Partial<PedidoResult> & { status: PedidoStatus }) => {
    const lines = o.lines ?? [];
    pedidos.push({
      key, label: PEDIDO_LABEL[key], total: lines.reduce((s, l) => s + l.value, 0), lines,
      memory: o.memory ?? [], premises: [...new Set(o.premises ?? [])], missing: o.missing ?? [],
      note: o.note, warnings: o.warnings ?? [], included: o.status === 'calculado' && !exclude.includes(key), status: o.status,
    });
  };
  /** Bloqueios comuns aos pedidos que dependem de hora e período. */
  const blocker = (): Partial<PedidoResult> & { status: PedidoStatus } | null => {
    if (prescribed && !monthsManual) return { status: 'sem_direito', note: 'Prescrito: passou o prazo de 2 anos da saída.' };
    const miss = (['salario', 'admissao', 'ainda_trabalha'] as FactKey[]).filter((k) => !r.asked(k));
    if (!(salary > 0) || !(months > 0) || miss.length)
      return { status: 'pendente', missing: miss.length ? miss : missingRequired, note: 'Faltam dados do contrato.' };
    return null;
  };
  const scheduleBlock = () =>
    !schedule ? { status: 'pendente' as const, missing: scheduleMissing, note: 'Falta a jornada (entrada, saída e dias por semana).' } : null;

  // Horas extras
  {
    const b = blocker() ?? scheduleBlock();
    if (b) push('horas_extras', b);
    else if (schedule!.hours50 + schedule!.hours100 <= 0) push('horas_extras', { status: 'sem_direito', note: `Jornada de ${fmtNum(schedule!.weekly, 1)}h/semana, dentro do limite.` });
    else {
      const s = schedule!;
      const m = overtimeMonthly(hourly, { hours50: s.hours50, pct50: 50, hours100: s.hours100, pct100: 100 });
      const rf = withReflexes({ ...reflexCommon, monthly: m.monthly, dsrRate });
      const memory = [
        hourlyMemo(),
        `Jornada: ${fmtNum(s.workedPerDay, 2)}h/dia × ${fmtNum(days!)} dias = ${fmtNum(s.weekly, 1)}h/semana (limite ${fmtNum(contractual)}h)`,
        `Extras: ${fmtNum(s.weeklyOvertime, 2)}h/semana × ${fmtNum(4.348, 3)} semanas${(r.get<number>('he_pagas') ?? 0) > 0 ? ' − horas já pagas' : ''} = ${fmtNum(s.hours50, 1)}h/mês a 50%`,
      ];
      if (s.hours100) memory.push(`Domingos/feriados: ${fmtNum(s.hours100, 1)}h/mês a 100%`);
      memory.push(`Valor mensal = ${brl(m.monthly)}`, monthsMemo());
      const w: string[] = [];
      if (p.dsrReflexShare < 1) w.push(`DSR reflete em 13º/férias só desde 20/03/2023 (${fmtNum(p.dsrReflexShare * 100, 0)}% do período).`);
      push('horas_extras', { status: 'calculado', lines: rf.lines, memory, premises: [...base, ...sched], warnings: w });
    }
  }

  // Intervalo
  {
    const b = blocker() ?? scheduleBlock();
    if (b) push('intervalo', b);
    else if (schedule!.breakSuppressedMinutes <= 0) push('intervalo', { status: 'sem_direito', note: 'Intervalo cumprido.' });
    else {
      const s = schedule!;
      const monthly = breakMonthly(hourly, s.breakSuppressedMinutes, s.breakDaysPerMonth);
      push('intervalo', {
        status: 'calculado',
        lines: [{ label: 'Intervalo suprimido (indenizatório)', value: monthly * months }],
        memory: [hourlyMemo(), `${fmtNum(s.breakSuppressedMinutes)} min/dia × ${fmtNum(s.breakDaysPerMonth, 1)} dias × hora + 50% = ${brl(monthly)}/mês`, monthsMemo()],
        premises: [...base, ...sched],
        warnings: ['Pós-reforma (11/11/2017): paga só o tempo suprimido, sem reflexos.'],
      });
    }
  }

  // Adicional noturno
  {
    const b = blocker() ?? scheduleBlock();
    const own = new Set<FactKey>();
    if (b) push('adicional_noturno', b);
    else if (schedule!.nightHoursPerMonth <= 0) push('adicional_noturno', { status: 'sem_direito', note: 'Sem trabalho entre 22h e 5h.' });
    else if (r.get<boolean>('noturno_pago', own)) push('adicional_noturno', { status: 'sem_direito', note: 'Já recebia adicional noturno.' });
    else {
      const monthly = nightMonthly(hourly, schedule!.nightHoursPerMonth);
      const rf = withReflexes({ ...reflexCommon, monthly, dsrRate });
      push('adicional_noturno', {
        status: 'calculado', lines: rf.lines,
        memory: [hourlyMemo(), `${fmtNum(schedule!.nightHoursPerMonth, 1)}h noturnas/mês × 60/52,5 × 20% = ${brl(monthly)}/mês`, monthsMemo()],
        premises: [...base, ...sched, ...own],
      });
    }
  }

  // Insalubridade / periculosidade
  {
    const b = blocker();
    const own = new Set<FactKey>();
    if (b) push('insalubridade_periculosidade', b);
    else if (!allowance.applied) push('insalubridade_periculosidade', { status: 'sem_direito', note: 'Sem exposição informada.', premises: [...base] });
    else {
      const isHazard = allowance.applied === 'hazard';
      const paid = r.get<boolean>(isHazard ? 'periculosidade_paga' : 'insalubridade_paga', own);
      if (paid) push('insalubridade_periculosidade', { status: 'sem_direito', note: 'Já recebia o adicional (entra só na base da hora).' });
      else {
        const rf = withReflexes({ ...reflexCommon, monthly: allowance.value, dsrRate: null });
        const label = isHazard ? 'Periculosidade 30% do salário' : `Insalubridade ${grade}% do mínimo (${brl(minimumWage)})`;
        push('insalubridade_periculosidade', {
          status: 'calculado', lines: rf.lines,
          memory: [`${label} = ${brl(allowance.value)}/mês`, monthsMemo()],
          premises: [...base, ...own],
          warnings: isHazard ? [] : ['Insalubridade depende de perícia.'],
        });
      }
    }
  }

  // Verbas rescisórias
  const contractMonths = admission && exit ? monthsReal(admission, exit) : 0;
  const fgtsOwn = new Set<FactKey>();
  const fgtsAnswer = r.get<FgtsDeposited>('fgts_depositado', fgtsOwn) ?? 'sim';
  const monthsWithoutFgts = fgtsAnswer === 'nao' ? contractMonths : fgtsAnswer === 'parcial' ? r.get<number>('meses_sem_fgts') : 0;
  if (ended && termination && admission && exit) {
    const own = new Set<FactKey>(fgtsOwn);
    const paid: SeverancePaid = indirect ? 'nao' : (r.get<SeverancePaid>('rescisao_recebida', own) ?? 'total');
    const onTime = paid === 'nao' ? false : (r.get<boolean>('rescisao_no_prazo', own) ?? true);
    if (prescribed) push('rescisorias', { status: 'sem_direito', note: 'Prescrito.' });
    else if (!(salary > 0)) push('rescisorias', { status: 'pendente', missing: ['salario'] });
    else {
      const saldo = r.confirmed('saldo_fgts') as number | undefined;
      const deposited = Math.max(0, contractMonths - (monthsWithoutFgts ?? 0));
      const fgtsBase = saldo ?? 0.08 * (remuneration + allowance.value) * deposited;
      const sv = calcSeverance({
        salary: remuneration + allowance.value, admission, exit, termination, notice,
        expiredVacations: r.get<number>('ferias_vencidas', own) ?? 0,
        fgtsBalance: fgtsBase, fine477: !onTime,
      });
      const memory = [
        `Remuneração = ${brl(remuneration + allowance.value)} · aviso ${notice === 'indenizado' ? `indenizado de ${sv.noticeDays} dias` : notice}`,
        `Saída projetada: ${fmtDate(sv.projectedExit)}`,
        `Saldo FGTS ${saldo != null ? 'informado' : 'estimado'}: ${brl(fgtsBase)}`,
      ];
      // Sempre mostra as verbas devidas; o que foi recebido entra como desconto e sobra o "a cobrar".
      const fine477 = sv.lines.find((l) => l.label.startsWith('Multa art. 477'))?.value ?? 0;
      const dueWithoutFine = sv.total - fine477;
      if (paid === 'total') {
        const lines = [...sv.lines, { label: 'Já recebido na rescisão', value: -dueWithoutFine }];
        push('rescisorias', {
          status: fine477 ? 'calculado' : 'sem_direito', lines,
          note: fine477 ? 'Recebeu a rescisão com atraso: a cobrar só a multa do art. 477.' : 'Recebeu a rescisão no prazo: nada a cobrar.',
          memory, premises: [...own],
        });
      } else if (paid === 'parcial') {
        const received = r.confirmed('valor_recebido') as number | undefined;
        if (received == null) push('rescisorias', { status: 'pendente', lines: sv.lines, missing: ['valor_recebido'], note: 'Falta quanto recebeu.', memory });
        else push('rescisorias', {
          status: 'calculado',
          lines: [...sv.lines, { label: 'Já recebido', value: -Math.min(received, sv.total) }],
          memory: [...memory, `Devido ${brl(sv.total)} − recebido ${brl(received)}`], premises: [...own],
          warnings: ['Confira o TRCT: o desconto é pelo total recebido.'],
        });
      } else {
        push('rescisorias', { status: 'calculado', lines: sv.lines, memory, premises: [...own], warnings: indirect ? ['Rescisão indireta depende de reconhecimento judicial.'] : [] });
      }
    }
  }

  // FGTS não depositado (prescrição quinquenal, STF ARE 709.212)
  {
    const b = blocker();
    if (b) push('fgts', b);
    else if (fgtsAnswer === 'sim') push('fgts', { status: 'sem_direito', note: 'FGTS depositado.', premises: [...fgtsOwn] });
    else if (monthsWithoutFgts == null) push('fgts', { status: 'pendente', missing: ['meses_sem_fgts'] });
    else {
      const m = Math.min(monthsWithoutFgts, months);
      const principal = 0.08 * (remuneration + allowance.value) * m;
      const lines: Line[] = [{ label: `FGTS 8% × ${fmtNum(m, 1)} meses`, value: principal }];
      if (fineRate) lines.push({ label: `Multa ${Math.round(fineRate * 100)}% FGTS`, value: principal * fineRate });
      push('fgts', {
        status: 'calculado', lines,
        memory: [`8% × ${brl(remuneration + allowance.value)} × ${fmtNum(m, 1)} meses = ${brl(principal)}`],
        premises: [...fgtsOwn, ...base],
      });
    }
  }

  // Perguntas pendentes: fatos aplicáveis que ninguém perguntou ainda
  const pending: PendingQuestion[] = FACTS
    .filter((d) => (d.relevant?.(r.confirmed) ?? true) && !r.asked(d.key))
    .filter((d) => d.key !== 'aviso' || notice !== 'nao_houve')
    .map((d) => ({
      key: d.key, label: d.label, question: d.question, why: d.why, impact: d.impact, kind: d.kind, options: d.options,
      required: !!d.required?.(r.confirmed),
    }))
    .sort((a, b) => Number(b.required) - Number(a.required) || b.impact - a.impact);

  // Confiança e faixa
  const calculated = pedidos.filter((x) => x.included);
  const total = calculated.reduce((s, x) => s + x.total, 0);
  const premises = [...r.premises.values()];
  const unresolved = premises.filter((x) => !x.asked && x.impact >= 2 && pedidos.some((pd) => pd.status === 'calculado' && pd.premises.includes(x.key)));
  const pendingPedidos = pedidos.filter((x) => x.status === 'pendente');

  let confidence: Confidence;
  let confidenceReason: string;
  if (missingRequired.length || eligibility.status === 'incompleto' || eligibility.error) {
    confidence = 'insuficiente';
    confidenceReason = `Faltam: ${missingRequired.map((k) => FACT_BY_KEY.get(k)!.label.toLowerCase()).join(', ') || 'datas do contrato'}.`;
  } else if (unresolved.length || pendingPedidos.length) {
    confidence = 'parcial';
    const bits: string[] = [];
    if (unresolved.length) bits.push(`${unresolved.length} ${unresolved.length === 1 ? 'informação presumida' : 'informações presumidas'}`);
    if (pendingPedidos.length) bits.push(`${pendingPedidos.length} ${pendingPedidos.length === 1 ? 'cálculo sem dados' : 'cálculos sem dados'}`);
    confidenceReason = `${bits.join(' e ')}. Responda as perguntas para fechar a faixa.`;
  } else {
    confidence = 'completo';
    confidenceReason = 'Todos os fatos que mudam o valor foram respondidos.';
  }
  const band = confidence === 'insuficiente' ? null : ESTIMATE_BANDS[confidence];
  const range = band && total > 0 ? { low: total * band[0], high: total * band[1] } : null;

  return {
    eligibility, pedidos, total, range, confidence, confidenceReason, pending, premises, warnings,
    hourly: Number.isFinite(hourly) ? hourly : null, schedule,
  };
}

function eligibilityOf(p: ReturnType<typeof calcPrescription>, datesKnown: boolean): Eligibility {
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const baseE = {
    deadline: iso(p.deadline), daysLeft: p.daysLeft, periodStart: iso(p.periodStart), periodEnd: iso(p.periodEnd),
    months: p.months, noticeDays: p.noticeDays,
  };
  if (p.error) return { ...baseE, status: 'incompleto', message: p.error, error: p.error };
  if (!datesKnown || p.status === 'incompleto')
    return { ...baseE, status: 'incompleto', message: 'Faltam admissão, se ainda trabalha, saída e como saiu.' };
  const period = p.periodStart && p.periodEnd ? `${fmtDate(p.periodStart)} a ${fmtDate(p.periodEnd)} (${fmtNum(p.months, 1)} meses)` : '';
  if (p.status === 'prescrito') return { ...baseE, status: p.status, message: `Prescrito: o prazo de 2 anos venceu em ${fmtDate(p.deadline!)}.` };
  if (p.status === 'ativo') return { ...baseE, status: p.status, message: `Contrato ativo, sem prazo de 2 anos correndo. Período cobrável: ${period}.` };
  return { ...baseE, status: p.status, message: `Dentro do prazo: entrar até ${fmtDate(p.deadline!)} (${p.daysLeft} dias). Período cobrável: ${period}.` };
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  insuficiente: 'Dados insuficientes',
  parcial: 'Estimativa parcial',
  completo: 'Estimativa completa',
};

/** Texto do caso para copiar. */
export function caseSummaryText(res: CaseResult, empresa?: string): string {
  const out = [`Central Trabalhista — ${empresa || 'caso'}`, res.eligibility.message, ''];
  for (const pd of res.pedidos) {
    if (pd.status === 'calculado') {
      out.push(`## ${pd.label}${pd.included ? '' : ' (fora do total)'}`, ...pd.memory, ...pd.lines.map((l) => `${l.label}: ${brl(l.value)}`), `Subtotal: ${brl(pd.total)}`, '');
    } else if (pd.status === 'pendente') out.push(`## ${pd.label}: pendente — ${pd.note ?? 'faltam dados'}`, '');
  }
  out.push(`TOTAL ESTIMADO: ${brl(res.total)}`);
  if (res.range) out.push(`Faixa: ${brl(res.range.low)} a ${brl(res.range.high)} (${CONFIDENCE_LABEL[res.confidence].toLowerCase()})`);
  if (res.premises.length) out.push('', 'Premissas (confirmar):', ...res.premises.map((x) => `- ${x.label}: ${x.assumed}${x.asked ? ' (lead não sabe)' : ''}`));
  if (res.pending.length) out.push('', 'Perguntas pendentes:', ...res.pending.map((q) => `- ${q.question}`));
  out.push('', 'Estimativa sem correção monetária, juros, INSS e IR. Não substitui o cálculo de liquidação.');
  return out.join('\n');
}

export { describe as describeFact };
