import { addDays, addYears, daysBetween, fullYears, maxDate, monthsReal, toDate } from './dates';

export type Termination = 'sem_justa_causa' | 'rescisao_indireta' | 'acordo' | 'pedido_demissao' | 'justa_causa';

export const TERMINATION_LABEL: Record<Termination, string> = {
  sem_justa_causa: 'Dispensa sem justa causa',
  rescisao_indireta: 'Rescisão indireta',
  acordo: 'Acordo (art. 484-A)',
  pedido_demissao: 'Pedido de demissão',
  justa_causa: 'Justa causa',
};

/** Multa do FGTS por tipo de desligamento. */
export const FGTS_FINE_RATE: Record<Termination, number> = {
  sem_justa_causa: 0.4,
  rescisao_indireta: 0.4,
  acordo: 0.2,
  pedido_demissao: 0,
  justa_causa: 0,
};

/** Aviso prévio proporcional (Lei 12.506/11): 30 dias + 3 por ano completo, até 90. */
export const noticeDays = (admission: Date, exit: Date) => 30 + 3 * Math.min(20, fullYears(admission, exit));

export type NoticeKind = 'indenizado' | 'trabalhado' | 'nao_houve';

export const NOTICE_LABEL: Record<NoticeKind, string> = {
  indenizado: 'Indenizado (não trabalhou o aviso)',
  trabalhado: 'Trabalhado',
  nao_houve: 'Não houve aviso',
};

/** Aviso esperado quando o lead não informa. */
export const defaultNotice = (t: Termination): NoticeKind =>
  t === 'sem_justa_causa' || t === 'rescisao_indireta' || t === 'acordo' ? 'indenizado' : t === 'pedido_demissao' ? 'trabalhado' : 'nao_houve';

/** Dias de aviso indenizado pelo empregador. Só existe se o aviso foi indenizado; acordo paga metade (art. 484-A, I, a). */
export function indemnifiedNoticeDays(t: Termination, days: number, notice: NoticeKind = defaultNotice(t)): number {
  if (notice !== 'indenizado') return 0;
  if (t === 'sem_justa_causa' || t === 'rescisao_indireta') return days;
  if (t === 'acordo') return days / 2;
  return 0;
}

/** Início da tese do TST sobre reflexo do DSR majorado (IncJulgRREmbRep 10169-57.2013.5.05.0024). */
export const DSR_REFLEX_CUTOFF = toDate('2023-03-20')!;

export type PrescriptionStatus = 'incompleto' | 'ativo' | 'no_prazo' | 'prescrito';

export interface PrescriptionResult {
  status: PrescriptionStatus;
  error?: string;
  /** Saída somada ao aviso indenizado (OJ 83 SDI-1). */
  projectedExit: Date | null;
  /** Último dia para ajuizar (prescrição bienal, art. 7º XXIX CF). */
  deadline: Date | null;
  daysLeft: number | null;
  /** Período cobrável (prescrição quinquenal a partir do ajuizamento). */
  periodStart: Date | null;
  periodEnd: Date | null;
  months: number;
  /** Parcela do período a partir de 20/03/2023, em que o DSR majorado reflete nas demais verbas. */
  dsrReflexShare: number;
  noticeDays: number;
}

export interface PrescriptionInput {
  admission: Date | null;
  exit: Date | null;
  filing: Date;
  termination: Termination;
  notice?: NoticeKind;
}

const EMPTY: PrescriptionResult = {
  status: 'incompleto', projectedExit: null, deadline: null, daysLeft: null,
  periodStart: null, periodEnd: null, months: 0, dsrReflexShare: 1, noticeDays: 0,
};

export function calcPrescription({ admission, exit, filing, termination, notice }: PrescriptionInput): PrescriptionResult {
  if (!admission) return EMPTY;
  const end = exit ?? filing;
  if (end < admission) return { ...EMPTY, error: 'A saída é anterior à admissão.' };
  if (exit && exit > filing) return { ...EMPTY, error: 'A saída é posterior à data de ajuizamento.' };

  const nDays = exit ? noticeDays(admission, exit) : 0;
  const projectedExit = exit ? addDays(exit, Math.floor(indemnifiedNoticeDays(termination, nDays, notice))) : null;
  const deadline = projectedExit ? addYears(projectedExit, 2) : null;
  const status: PrescriptionStatus = !exit ? 'ativo' : filing > deadline! ? 'prescrito' : 'no_prazo';

  const start = maxDate(admission, addYears(filing, -5));
  const months = status === 'prescrito' ? 0 : monthsReal(start, end);

  let dsrReflexShare = 0;
  if (end >= DSR_REFLEX_CUTOFF && end >= start) {
    const from = maxDate(start, DSR_REFLEX_CUTOFF);
    dsrReflexShare = (daysBetween(from, end) + 1) / (daysBetween(start, end) + 1);
  }

  return {
    status,
    projectedExit,
    deadline,
    daysLeft: deadline ? daysBetween(filing, deadline) : null,
    periodStart: start,
    periodEnd: end,
    months,
    dsrReflexShare,
    noticeDays: nDays,
  };
}
