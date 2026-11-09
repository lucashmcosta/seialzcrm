import { describe, expect, it } from 'vitest';
import { avos, avos13, toDate } from '../src/widgets/labor-center/calc/dates';
import { parseNum } from '../src/widgets/labor-center/calc/money';
import { calcPrescription, noticeDays } from '../src/widgets/labor-center/calc/prescription';
import { calcAllowance, hourlyRate, nightMonthly, overtimeMonthly } from '../src/widgets/labor-center/calc/rates';
import { withReflexes } from '../src/widgets/labor-center/calc/reflexes';
import { calcSeverance } from '../src/widgets/labor-center/calc/severance';

const D = (s: string) => toDate(s)!;
const ALL = { dsr: true, decimo: true, ferias: true, fgts: true };

describe('parseNum', () => {
  it('aceita pt-BR e ponto decimal sem multiplicar por mil', () => {
    expect(parseNum('3.000,50')).toBe(3000.5);
    expect(parseNum('3000.50')).toBe(3000.5);
    expect(parseNum('1.5')).toBe(1.5);
    expect(parseNum('1,5')).toBe(1.5);
    expect(parseNum('3.000')).toBe(3000);
    expect(parseNum('1.234.567')).toBe(1234567);
    expect(parseNum('R$ 2.200,00')).toBe(2200);
    expect(parseNum('')).toBeNaN();
    expect(parseNum('abc')).toBeNaN();
  });
});

describe('datas', () => {
  it('avos contam fração de 15 dias ou mais', () => {
    expect(avos(D('2025-01-10'), D('2025-04-23'))).toBe(3); // 3 meses + 14 dias
    expect(avos(D('2025-01-10'), D('2025-04-24'))).toBe(4); // 3 meses + 15 dias
  });
  it('avos de 13º por mês civil', () => {
    expect(avos13(D('2025-01-01'), D('2025-06-14'))).toBe(5);
    expect(avos13(D('2025-01-01'), D('2025-06-15'))).toBe(6);
    expect(avos13(D('2025-03-20'), D('2025-12-31'))).toBe(9); // março tem 12 dias
  });
});

describe('prescrição', () => {
  it('aviso proporcional: 30 + 3 por ano, teto 90', () => {
    expect(noticeDays(D('2020-01-01'), D('2020-12-31'))).toBe(30);
    expect(noticeDays(D('2020-01-01'), D('2025-01-01'))).toBe(45);
    expect(noticeDays(D('1990-01-01'), D('2025-01-01'))).toBe(90);
  });

  it('bienal conta da saída projetada pelo aviso indenizado', () => {
    const p = calcPrescription({ admission: D('2020-01-01'), exit: D('2024-01-01'), filing: D('2026-01-20'), termination: 'sem_justa_causa' });
    expect(p.noticeDays).toBe(42);
    expect(p.status).toBe('no_prazo'); // 01/01/2024 + 42 dias = 12/02/2024 → prazo 12/02/2026
    expect(p.deadline!.toISOString().slice(0, 10)).toBe('2026-02-12');
  });

  it('pedido de demissão não projeta aviso e prescreve', () => {
    const p = calcPrescription({ admission: D('2020-01-01'), exit: D('2024-01-01'), filing: D('2026-01-20'), termination: 'pedido_demissao' });
    expect(p.status).toBe('prescrito');
    expect(p.months).toBe(0);
  });

  it('quinquenal limita a 5 anos antes do ajuizamento', () => {
    const p = calcPrescription({ admission: D('2015-01-01'), exit: D('2026-01-01'), filing: D('2026-06-01'), termination: 'sem_justa_causa' });
    expect(p.periodStart!.toISOString().slice(0, 10)).toBe('2021-06-01');
    expect(p.months).toBeCloseTo(55, 0);
    // 20/03/2023 → 01/01/2026 = 1018 de 1676 dias
    expect(p.dsrReflexShare).toBeCloseTo(1018 / 1676, 2);
  });

  it('contrato ativo não corre bienal', () => {
    const p = calcPrescription({ admission: D('2024-01-01'), exit: null, filing: D('2026-01-01'), termination: 'sem_justa_causa' });
    expect(p.status).toBe('ativo');
    expect(p.months).toBeCloseTo(24, 0);
  });
});

describe('hora extra e adicionais', () => {
  it('hora normal integra o maior adicional, sem acumular', () => {
    const a = calcAllowance({ salary: 3000, minimumWage: 1621, insalubrity: 40, hazard: true });
    expect(a.hazard).toBe(900);
    expect(a.insalubrity).toBeCloseTo(648.4);
    expect(a.applied).toBe('hazard');
    expect(a.bothSelected).toBe(true);
    expect(hourlyRate(3000, a.value, 220)).toBeCloseTo(17.727, 3);
  });

  it('50% e 100% juntos', () => {
    const m = overtimeMonthly(10, { hours50: 20, pct50: 50, hours100: 5, pct100: 100 });
    expect(m.v50).toBe(300);
    expect(m.v100).toBe(100);
    expect(m.monthly).toBe(400);
  });

  it('noturno com hora reduzida', () => {
    expect(nightMonthly(10, 52.5)).toBeCloseTo(120); // 10 × 20% × 60 h reduzidas
  });

  it('reflexos: DSR, 13º, férias + 1/3, FGTS e multa', () => {
    const r = withReflexes({ monthly: 400, months: 12, toggles: ALL, dsrRate: 0.2, dsrReflexShare: 1, fineRate: 0.4 });
    const v = Object.fromEntries(r.lines.map((l) => [l.label, l.value]));
    expect(v['Principal']).toBe(4800);
    expect(v['Reflexo em DSR']).toBe(960);
    expect(v['Reflexo em 13º']).toBe(480);
    expect(v['Reflexo em férias + 1/3']).toBeCloseTo(640);
    expect(v['FGTS 8%']).toBeCloseTo(499.2); // 8% × (4800 + 960 + 480)
    expect(v['Multa 40% FGTS']).toBeCloseTo(199.68);
    expect(r.total).toBeCloseTo(7578.88);
  });

  it('DSR antes de 20/03/2023 não reflete em 13º/férias', () => {
    const r = withReflexes({ monthly: 100, months: 12, toggles: ALL, dsrRate: 0.2, dsrReflexShare: 0, fineRate: 0 });
    expect(r.lines.find((l) => l.label === 'Reflexo em 13º')!.value).toBe(100);
  });
});

describe('rescisão', () => {
  it('sem justa causa com 2 anos e meio', () => {
    const r = calcSeverance({
      salary: 3000, admission: D('2023-01-02'), exit: D('2025-07-10'), termination: 'sem_justa_causa',
      expiredVacations: 0, fgtsBalance: 7000, fine477: false,
    });
    expect(r.noticeDays).toBe(36);
    // saída projetada: 10/07 + 36 = 15/08/2025
    expect(r.projectedExit.toISOString().slice(0, 10)).toBe('2025-08-15');
    expect(r.thirteenthAvos).toBe(8); // agosto com 15 dias conta
    expect(r.vacationAvos).toBe(7); // desde 02/01/2025: 7 meses + 14 dias
    const v = Object.fromEntries(r.lines.map((l) => [l.label.split(' (')[0], l.value]));
    expect(v['Saldo de salário']).toBe(1000);
    expect(v['Aviso prévio indenizado']).toBe(3600);
    expect(v['13º proporcional']).toBe(2000);
    expect(v['Férias proporcionais + 1/3']).toBeCloseTo(2333.33, 2);
    expect(v['Multa 40% FGTS']).toBeCloseTo(0.4 * (7000 + 0.08 * 6600));
  });

  it('justa causa perde aviso, 13º e férias proporcionais e multa', () => {
    const r = calcSeverance({
      salary: 3000, admission: D('2023-01-02'), exit: D('2025-07-10'), termination: 'justa_causa',
      expiredVacations: 1, fgtsBalance: 7000, fine477: false,
    });
    const labels = r.lines.map((l) => l.label);
    expect(labels.some((l) => l.startsWith('Aviso'))).toBe(false);
    expect(labels.some((l) => l.startsWith('13º'))).toBe(false);
    expect(labels.some((l) => l.startsWith('Férias proporcionais'))).toBe(false);
    expect(labels.some((l) => l.startsWith('Multa'))).toBe(false);
    expect(r.lines.find((l) => l.label.startsWith('Férias vencidas'))!.value).toBe(4000);
  });

  it('acordo: metade do aviso e multa de 20%', () => {
    const r = calcSeverance({
      salary: 3000, admission: D('2023-01-02'), exit: D('2025-07-10'), termination: 'acordo',
      expiredVacations: 0, fgtsBalance: 1000, fine477: false,
    });
    expect(r.lines.find((l) => l.label.startsWith('Aviso'))!.value).toBe(1800);
    expect(r.lines.some((l) => l.label === 'Multa 20% FGTS')).toBe(true);
  });
});

