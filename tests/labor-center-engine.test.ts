import { describe, expect, it } from 'vitest';
import {
  calcularCaso, caseSummaryText, FACT_KEYS, FACTS, type Facts, type PedidoKey,
} from '../src/widgets/labor-center/calc';
import { nightMinutesPerDay, parseTime, scheduleHours } from '../src/widgets/labor-center/calc/jornada';

const c = (v: unknown) => ({ value: v, source: 'lead' as const });
const pedido = (r: ReturnType<typeof calcularCaso>, k: PedidoKey) => r.pedidos.find((p) => p.key === k)!;

/** Saiu em 10/07/2025, mandado embora, 08h–19h com 30 min de almoço, 6 dias. */
const base: Facts = {
  salario: c(2200), admissao: c('2023-01-02'), ainda_trabalha: c(false), saida: c('2025-07-10'),
  desligamento: c('sem_justa_causa'), entrada: c('08:00'), saida_expediente: c('19:00'), intervalo: c(30), dias_semana: c(6),
};
const settings = { filingDate: '2026-03-01' };

/** Todo fato aplicável respondido. */
const full: Facts = {
  ...base, empresa: c('Mercado X'), remuneracao_variavel: c(0), aviso: c('indenizado'), jornada_contratual: c(44),
  domingos_feriados: c(0), he_pagas: c(0), insalubridade: c('nao'), periculosidade: c(false),
  rescisao_recebida: c('total'), rescisao_no_prazo: c(true), ferias_vencidas: c(0), fgts_depositado: c('sim'), saldo_fgts: c(5000),
};

describe('catálogo', () => {
  it('FACT_KEYS e FACTS têm as mesmas chaves, na mesma ordem', () => {
    expect(FACTS.map((f) => f.key)).toEqual([...FACT_KEYS]);
  });
});

describe('jornada', () => {
  it('lê horários em vários formatos', () => {
    expect(parseTime('08:00')).toBe(480);
    expect(parseTime('8h30')).toBe(510);
    expect(parseTime('19h')).toBe(1140);
    expect(parseTime('25:00')).toBeNull();
  });
  it('excesso semanal ganha do diário quando é maior (não soma)', () => {
    const h = scheduleHours({ schedule: { start: 480, end: 1140, breakMinutes: 30, daysPerWeek: 6 }, contractualWeekly: 44, restDaysWorkedPerMonth: 0, paidOvertimePerMonth: 0 });
    expect(h.workedPerDay).toBe(10.5);
    expect(h.weekly).toBe(63);
    expect(h.weeklyOvertime).toBe(19); // 63 − 44 > (10,5 − 8) × 6 = 15
    expect(h.breakSuppressedMinutes).toBe(30);
    expect(h.nightHoursPerMonth).toBe(0);
  });
  it('turno da noite atravessando a meia-noite', () => {
    expect(nightMinutesPerDay({ start: parseTime('22:00')!, end: parseTime('06:00')! })).toBe(420); // 22h–5h
    expect(nightMinutesPerDay({ start: parseTime('14:00')!, end: parseTime('23:00')! })).toBe(60);
  });
});

describe('perguntas e premissas', () => {
  it('caso vazio: insuficiente, perguntas obrigatórias primeiro', () => {
    const r = calcularCaso({ facts: {}, settings });
    expect(r.confidence).toBe('insuficiente');
    expect(r.range).toBeNull();
    expect(r.pending.slice(0, 3).map((q) => q.key)).toEqual(['salario', 'admissao', 'ainda_trabalha']);
    expect(r.pending.every((q) => q.question.length > 10)).toBe(true);
  });

  it('pergunta saída e como saiu só para quem saiu', () => {
    const ativo = calcularCaso({ facts: { ainda_trabalha: c(true) }, settings });
    expect(ativo.pending.map((q) => q.key)).not.toContain('saida');
    expect(ativo.pending.map((q) => q.key)).toContain('quer_rescisao_indireta');
    const saiu = calcularCaso({ facts: { ainda_trabalha: c(false) }, settings });
    expect(saiu.pending.filter((q) => q.required).map((q) => q.key)).toEqual(expect.arrayContaining(['saida', 'desligamento']));
  });

  it('caso com jornada calcula, mas fica parcial e lista as premissas', () => {
    const r = calcularCaso({ facts: base, settings });
    expect(r.hourly).toBe(10);
    expect(pedido(r, 'horas_extras').status).toBe('calculado');
    expect(pedido(r, 'intervalo').status).toBe('calculado');
    expect(pedido(r, 'adicional_noturno').status).toBe('sem_direito');
    expect(r.confidence).toBe('parcial');
    expect(r.premises.map((p) => p.key)).toEqual(expect.arrayContaining(['aviso', 'jornada_contratual', 'rescisao_recebida']));
    expect(r.pending.map((q) => q.key)).toEqual(expect.arrayContaining(['aviso', 'rescisao_recebida', 'fgts_depositado']));
    expect(r.pending.map((q) => q.key)).not.toContain('noturno_pago'); // não trabalhava à noite
    expect(r.range!.low).toBeLessThan(r.total);
    expect(r.range!.high).toBeGreaterThan(r.total);
  });

  it('tudo respondido: completo, sem pendências, faixa estreita', () => {
    const r = calcularCaso({ facts: full, settings });
    expect(r.pending).toEqual([]);
    expect(r.confidence).toBe('completo');
    expect(r.range!.low / r.total).toBeCloseTo(0.85);
    expect(pedido(r, 'rescisorias').status).toBe('sem_direito');
    expect(pedido(r, 'fgts').status).toBe('sem_direito');
  });

  it('"não sabe" usa a premissa e não pergunta de novo', () => {
    const r = calcularCaso({ facts: { ...full, aviso: { status: 'nao_sabe' } }, settings });
    expect(r.pending.map((q) => q.key)).not.toContain('aviso');
    const p = r.premises.find((x) => x.key === 'aviso')!;
    expect(p.asked).toBe(true);
    expect(r.confidence).toBe('completo'); // perguntado e o lead não sabe = incerteza aceita
  });

  it('aceita valores digitados digitados e tipados do mesmo jeito', () => {
    const typed = calcularCaso({ facts: full, settings });
    const typedAsText = calcularCaso({
      facts: { ...full, salario: c('2.200,00'), ainda_trabalha: c('não'), intervalo: c('30'), dias_semana: c('6') }, settings,
    });
    expect(typedAsText.total).toBeCloseTo(typed.total, 6);
  });
});

describe('elegibilidade', () => {
  const facts = (aviso: string): Facts => ({
    ...full, admissao: c('2020-01-01'), saida: c('2024-01-01'), aviso: c(aviso),
  });
  it('aviso indenizado projeta o prazo; trabalhado não', () => {
    const ind = calcularCaso({ facts: facts('indenizado'), settings: { filingDate: '2026-01-20' } });
    expect(ind.eligibility.status).toBe('no_prazo');
    const trab = calcularCaso({ facts: facts('trabalhado'), settings: { filingDate: '2026-01-20' } });
    expect(trab.eligibility.status).toBe('prescrito');
    expect(trab.pedidos.every((p) => p.status !== 'calculado')).toBe(true);
    expect(trab.total).toBe(0);
  });
});

describe('pedidos', () => {
  it('turno noturno: cobra adicional se não era pago e pergunta se era', () => {
    const night = { ...base, entrada: c('22:00'), saida_expediente: c('06:00'), intervalo: c(60), dias_semana: c(5) };
    const r = calcularCaso({ facts: night, settings });
    expect(pedido(r, 'adicional_noturno').status).toBe('calculado');
    expect(r.pending.map((q) => q.key)).toContain('noturno_pago');
    const paid = calcularCaso({ facts: { ...night, noturno_pago: c(true) }, settings });
    expect(pedido(paid, 'adicional_noturno').status).toBe('sem_direito');
  });

  it('rescisão parcial sem valor recebido fica pendente e pergunta o valor', () => {
    const r = calcularCaso({ facts: { ...full, rescisao_recebida: c('parcial') }, settings });
    expect(pedido(r, 'rescisorias').status).toBe('pendente');
    expect(r.pending.map((q) => q.key)).toContain('valor_recebido');
    const ok = calcularCaso({ facts: { ...full, rescisao_recebida: c('parcial'), valor_recebido: c(1000) }, settings });
    const sv = pedido(ok, 'rescisorias');
    expect(sv.status).toBe('calculado');
    expect(sv.lines.at(-1)).toEqual({ label: 'Já recebido', value: -1000 });
  });

  it('rescisão não recebida inclui multa do art. 477', () => {
    const r = calcularCaso({ facts: { ...full, rescisao_recebida: c('nao') }, settings });
    expect(pedido(r, 'rescisorias').lines.some((l) => l.label.startsWith('Multa art. 477'))).toBe(true);
  });

  it('periculosidade não paga vira pedido e entra na base da hora', () => {
    const r = calcularCaso({ facts: { ...full, periculosidade: c(true), periculosidade_paga: c(false) }, settings });
    expect(r.hourly).toBeCloseTo(13); // (2200 + 660) ÷ 220
    expect(pedido(r, 'insalubridade_periculosidade').status).toBe('calculado');
    const paid = calcularCaso({ facts: { ...full, periculosidade: c(true), periculosidade_paga: c(true) }, settings });
    expect(paid.hourly).toBeCloseTo(13);
    expect(pedido(paid, 'insalubridade_periculosidade').status).toBe('sem_direito');
  });

  it('FGTS não depositado: 8% por mês + multa de 40%', () => {
    const r = calcularCaso({ facts: { ...full, fgts_depositado: c('parcial'), meses_sem_fgts: c(10) }, settings });
    const f = pedido(r, 'fgts');
    expect(f.lines[0].value).toBeCloseTo(0.08 * 2200 * 10);
    expect(f.lines[1].value).toBeCloseTo(0.08 * 2200 * 10 * 0.4);
  });

  it('excluir pedido tira do total, mas mantém o cálculo', () => {
    const all = calcularCaso({ facts: full, settings });
    const noBreak = calcularCaso({ facts: full, settings, exclude: ['intervalo'] });
    expect(noBreak.total).toBeCloseTo(all.total - pedido(all, 'intervalo').total);
    expect(pedido(noBreak, 'intervalo').status).toBe('calculado');
  });

  it('resumo em texto lista premissas e perguntas', () => {
    const t = caseSummaryText(calcularCaso({ facts: base, settings }), 'Mercado X');
    expect(t).toContain('Central Trabalhista — Mercado X');
    expect(t).toContain('Premissas (confirmar):');
    expect(t).toContain('Perguntas pendentes:');
  });
});
