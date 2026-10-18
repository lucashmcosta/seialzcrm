// @ts-nocheck — executado com bun test
import { describe, expect, it } from 'bun:test';
import { gravar, ler, mudou } from './editor';
import cal from '../../../../../packages/motor-classificacao/dados/calibracao-v1.json';

describe('editor de calibração', () => {
  it('lê e grava sem mutar a original', () => {
    const nova = gravar(cal, ['horas_extras', 'probs', 'forte_sem_ponto'], 99);
    expect(ler(nova, ['horas_extras', 'probs', 'forte_sem_ponto'])).toBe(99);
    expect(ler(cal, ['horas_extras', 'probs', 'forte_sem_ponto'])).not.toBe(99);
    const faixa = gravar(cal, ['_faixas', 'score_faixas', 9, 'pct_comissao'], 250);
    expect(ler(faixa, ['_faixas', 'score_faixas', 9, 'pct_comissao'])).toBe(250);
  });
  it('marca o que mudou em relação à publicada', () => {
    const nova = gravar(cal, ['_geral', 'sm'], 1700);
    expect(mudou(cal, nova, ['_geral', 'sm'])).toBe(true);
    expect(mudou(cal, nova, ['_geral', 'reflexo'])).toBe(false);
    expect(mudou(null, nova, ['_geral', 'sm'])).toBe(false);
  });
});
