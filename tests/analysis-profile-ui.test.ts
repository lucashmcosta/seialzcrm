import { expect, test } from 'bun:test';
import { objectionKey as backendKey } from '../supabase/functions/_shared/intelligence/analysis-profile';
import { addObjection, emptyProfile, MAX_OBJECTIONS, objectionKey } from '../src/lib/analysisProfile';

test('chave igual à do backend', () => {
  for (const label of ['Já tem veterinário!', 'Medo de golpe', '  Carência  do plano ', 'Çã õ 123']) {
    expect(objectionKey(label)).toBe(backendKey(label));
  }
});

test('não repete, não aceita vazio nem nome reservado, respeita o limite', () => {
  const one = addObjection([], ' Medo de golpe ');
  expect(one).toEqual([{ key: 'medo_de_golpe', label: 'Medo de golpe' }]);
  expect(addObjection(one, 'medo de golpe')).toBe(one);
  expect(addObjection(one, '   ')).toBe(one);
  expect(addObjection(one, 'Price')).toBe(one);
  const full = Array.from({ length: MAX_OBJECTIONS }, (_, i) => ({ key: `k${i}`, label: `L${i}` }));
  expect(addObjection(full, 'Nova')).toBe(full);
});

test('sem perfil salvo começa no modelo geral', () => {
  expect(emptyProfile(null)).toEqual({ preset: 'geral', business_description: '', objections: [] });
  expect(emptyProfile({ preset: 'juridico' }).preset).toBe('juridico');
});
