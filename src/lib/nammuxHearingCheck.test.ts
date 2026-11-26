// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  type HearingCheckItem, dayBR, daysUntil, groupByKind, mapRow, problemText, todayInSaoPaulo, urgentCount, whenLabel,
} from './nammuxHearingCheck';

const base: HearingCheckItem = {
  kind: 'sem_aviso', opportunityId: 'o1', contactId: 'c1', contactName: 'Cliente Exemplo', cnj: '0000000-00.2026.5.02.0001',
  subtype: null, modality: null, timezone: 'America/Sao_Paulo', eventDay: '2026-11-25', eventHour: '09:40',
  toldDay: null, toldHour: null, toldAt: null, lastOutboundAt: null,
};

describe('datas', () => {
  it('dia em português, sem voltar um dia', () => {
    expect(dayBR('2026-11-19')).toBe('19/11/2026');
    expect(dayBR(null)).toBeNull();
  });

  it('dias até a audiência e rótulo', () => {
    expect(daysUntil('2026-11-19', '2026-11-19')).toBe(0);
    expect(daysUntil('2026-12-01', '2026-11-19')).toBe(12);
    expect(whenLabel('2026-11-19', '2026-11-19')).toBe('hoje');
    expect(whenLabel('2026-11-20', '2026-11-19')).toBe('amanhã');
    expect(whenLabel('2026-11-25', '2026-11-19')).toBe('em 6 dias');
    expect(whenLabel(null, '2026-11-19')).toBe('');
  });

  it('hoje em São Paulo não vira o dia antes da hora', () => {
    expect(todayInSaoPaulo(new Date('2026-11-19T02:30:00Z'))).toBe('2026-11-18');
    expect(todayInSaoPaulo(new Date('2026-11-19T03:30:00Z'))).toBe('2026-11-19');
  });
});

describe('texto do problema', () => {
  it('hora diferente', () => {
    expect(problemText({ ...base, kind: 'hora_diferente', toldDay: '2026-11-25', toldHour: '12:40' }))
      .toBe('A agenda diz 25/11/2026 às 09:40. A última mensagem ao cliente diz 12:40. Avise a hora certa.');
  });

  it('data que foi cancelada ou remarcada', () => {
    expect(problemText({ ...base, kind: 'data_mudou', eventDay: null, eventHour: null, toldDay: '2026-11-19', toldHour: '08:50' }))
      .toBe('O cliente foi avisado de 19/11/2026 às 08:50. Essa audiência foi cancelada na agenda. Não há mensagem nossa depois disso.');
    expect(problemText({ ...base, kind: 'data_mudou', eventDay: '2026-12-10', eventHour: '13:05', toldDay: '2026-12-09', toldHour: '14:20' }))
      .toBe('O cliente foi avisado de 09/12/2026 às 14:20. A audiência agora é em 10/12/2026 às 13:05. Não há mensagem nossa depois disso.');
  });

  it('sem aviso, com e sem hora', () => {
    expect(problemText(base)).toBe('Audiência em 25/11/2026 às 09:40. Não achei mensagem nossa com essa data. Confirme se o cliente sabe.');
    expect(problemText({ ...base, eventHour: null })).toBe('Audiência em 25/11/2026. Não achei mensagem nossa com essa data. Confirme se o cliente sabe.');
  });
});

describe('lista', () => {
  const items: HearingCheckItem[] = [
    { ...base, contactId: 'a', eventDay: '2026-12-03' },
    { ...base, contactId: 'b', eventDay: '2026-11-19' },
    { ...base, contactId: 'c', kind: 'data_mudou', eventDay: null, eventHour: null, toldDay: '2026-11-27', toldHour: '10:00' },
    { ...base, contactId: 'd', kind: 'hora_diferente', toldDay: '2026-11-25', toldHour: '12:40' },
    { ...base, contactId: 'e', kind: 'data_mudou', eventDay: null, eventHour: null, toldDay: '2026-11-19', toldHour: '08:50' },
  ];

  it('agrupa por gravidade e ordena pela data mais próxima', () => {
    const g = groupByKind(items);
    expect(g.map((x) => x.kind)).toEqual(['hora_diferente', 'data_mudou', 'sem_aviso']);
    expect(g[1].items.map((i) => i.contactId)).toEqual(['e', 'c']);
    expect(g[2].items.map((i) => i.contactId)).toEqual(['b', 'a']);
    expect(groupByKind([])).toEqual([]);
  });

  it('urgentes: hora errada, data que mudou e sem aviso até amanhã', () => {
    expect(urgentCount(items, '2026-11-19')).toBe(4);
    expect(urgentCount(items, '2026-11-10')).toBe(3);
  });

  it('linha do banco vira item', () => {
    expect(mapRow({ kind: 'sem_aviso', opportunity_id: 'o', contact_id: 'c', contact_name: 'N', cnj: null, subtype: null, modality: 'virtual',
      timezone: 'America/Cuiaba', event_day: '2026-11-25', event_hour: '09:40', told_day: null, told_hour: null, told_at: null, last_outbound_at: null }))
      .toMatchObject({ kind: 'sem_aviso', contactId: 'c', modality: 'virtual', timezone: 'America/Cuiaba', eventDay: '2026-11-25' });
  });
});
