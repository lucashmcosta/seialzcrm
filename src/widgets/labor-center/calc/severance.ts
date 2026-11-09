import { addDays, addYears, avos, avos13, fullYears, maxDate, monthsReal } from './dates';
import { FGTS_FINE_RATE, indemnifiedNoticeDays, noticeDays, type NoticeKind, type Termination } from './prescription';
import type { Line } from './reflexes';

export interface SeveranceInput {
  /** Remuneração de referência (salário + adicional fixo). */
  salary: number;
  admission: Date;
  exit: Date;
  termination: Termination;
  notice?: NoticeKind;
  /** Períodos de férias vencidas e não gozadas. */
  expiredVacations: number;
  /** Saldo do FGTS informado; `null` = estimar 8% × remuneração × meses de contrato. */
  fgtsBalance: number | null;
  /** Multa do art. 477 §8º (verbas pagas fora do prazo): 1 salário. */
  fine477: boolean;
}

export interface SeveranceResult {
  lines: Line[];
  total: number;
  noticeDays: number;
  projectedExit: Date;
  vacationAvos: number;
  thirteenthAvos: number;
  fgtsEstimated: boolean;
}

export function calcSeverance(i: SeveranceInput): SeveranceResult {
  const { salary: s, admission, exit, termination: t } = i;
  const daily = s / 30;
  const just = t === 'justa_causa';

  const nDays = noticeDays(admission, exit);
  const indemn = indemnifiedNoticeDays(t, nDays, i.notice);
  const projectedExit = addDays(exit, Math.floor(indemn));

  const balanceDays = Math.min(30, exit.getUTCDate());
  const salaryBalance = daily * balanceDays;
  const notice = daily * indemn;

  const yearStart = new Date(Date.UTC(projectedExit.getUTCFullYear(), 0, 1));
  const thirteenthAvos = just ? 0 : avos13(maxDate(admission, yearStart), projectedExit);
  const thirteenth = (s / 12) * thirteenthAvos;

  const lastAnniversary = addYears(admission, fullYears(admission, projectedExit));
  const vacationAvos = just ? 0 : Math.min(12, avos(lastAnniversary, projectedExit));
  const vacations = (s / 12) * vacationAvos * (4 / 3);
  const expired = s * (4 / 3) * Math.max(0, i.expiredVacations);

  const fgtsEstimated = i.fgtsBalance == null;
  const fgtsBase = fgtsEstimated ? 0.08 * s * monthsReal(admission, exit) : i.fgtsBalance!;
  const fgtsOnSeverance = 0.08 * (salaryBalance + notice + thirteenth);
  const fineRate = FGTS_FINE_RATE[t];
  const fgtsFine = fineRate * (fgtsBase + fgtsOnSeverance);

  const lines: Line[] = [{ label: `Saldo de salário (${balanceDays} dias)`, value: salaryBalance }];
  if (notice) lines.push({ label: `Aviso prévio indenizado (${Number.isInteger(indemn) ? indemn : indemn.toFixed(1)} dias)`, value: notice });
  if (thirteenth) lines.push({ label: `13º proporcional (${thirteenthAvos}/12)`, value: thirteenth });
  if (vacations) lines.push({ label: `Férias proporcionais + 1/3 (${vacationAvos}/12)`, value: vacations });
  if (expired) lines.push({ label: `Férias vencidas + 1/3 (${i.expiredVacations})`, value: expired });
  lines.push({ label: 'FGTS 8% sobre rescisórias', value: fgtsOnSeverance });
  if (fgtsFine) lines.push({ label: `Multa ${Math.round(fineRate * 100)}% FGTS`, value: fgtsFine });
  if (i.fine477) lines.push({ label: 'Multa art. 477 §8º', value: s });

  return {
    lines,
    total: lines.reduce((acc, l) => acc + l.value, 0),
    noticeDays: nDays,
    projectedExit,
    vacationAvos,
    thirteenthAvos,
    fgtsEstimated,
  };
}
