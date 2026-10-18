// @ts-nocheck — executado com bun test
import { describe, expect, it } from 'bun:test';
import { gerarCsv } from './csv';

describe('CSV para Excel pt-BR', () => {
  it('BOM, ";" e vírgula decimal; escapa aspas, ";" e quebra de linha', () => {
    const csv = gerarCsv([{ chave: 'a', titulo: 'Tese' }, { chave: 'b', titulo: 'Chance' }, { chave: 'c', titulo: 'Excluída' }],
      [{ a: 'Horas extras; "noturno"', b: 0.95, c: false }, { a: 'linha\nquebrada', b: null, c: true }]);
    expect(csv.startsWith('﻿Tese;Chance;Excluída\r\n')).toBe(true);
    expect(csv).toContain('"Horas extras; ""noturno""";0,95;não\r\n');
    expect(csv).toContain('"linha\nquebrada";;sim\r\n');
  });
});
