import { test, expect, mock } from 'bun:test';

// O hook importa o client do Supabase (env do Vite); só testamos as funções puras.
mock.module('@/integrations/supabase/client', () => ({ supabase: {} }));
const { computeCanonicalActive, legacyCredentialFor } = await import('../src/hooks/useMetaConnection');

test('canonicalActive = (flagOn || !hasLegacy) && healthy', () => {
  // [flagOn, hasLegacy, healthy, expected]
  const cases: Array<[boolean, boolean, boolean, boolean]> = [
    [false, true, true, false],  // legado + flag OFF → legado (ex.: Central Trabalhista)
    [false, false, true, true],  // sem legado → canônico automático (ex.: Auxilius)
    [true, true, true, true],    // flag ON → canônico (ex.: Viagi)
    [true, false, true, true],
    [false, false, false, false], // sem conexão saudável → nunca canônico
    [true, true, false, false],
  ];
  for (const [flag, legacy, healthy, expected] of cases) {
    expect(computeCanonicalActive(flag, legacy, healthy)).toBe(expected);
  }
});

test('legacyCredentialFor espelha a credencial legada de cada capability no backend', () => {
  const none = { tokenSlugs: [] as string[], capiToken: false };
  expect(legacyCredentialFor('lead-generation', { tokenSlugs: ['meta-lead-ads'], capiToken: false })).toBe(true);
  expect(legacyCredentialFor('lead-generation', { tokenSlugs: ['meta'], capiToken: true })).toBe(false);
  expect(legacyCredentialFor('capi', { tokenSlugs: ['meta-lead-ads'], capiToken: false })).toBe(false);
  expect(legacyCredentialFor('capi', { tokenSlugs: [], capiToken: true })).toBe(true);
  expect(legacyCredentialFor('asset:ad_account', { tokenSlugs: ['meta'], capiToken: false })).toBe(true);
  expect(legacyCredentialFor('asset:ad_account', { tokenSlugs: [], capiToken: true })).toBe(true);
  expect(legacyCredentialFor('asset:ad_account', none)).toBe(false);
});
