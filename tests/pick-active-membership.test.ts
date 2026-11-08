import { pickActiveMembership } from '../src/lib/pick-active-membership.ts';
const m = (id: string, created_at: string, step: string | null) => ({ created_at, organization: { id, onboarding_step: step } });
Deno.test('0 vínculos → null', () => {
  if (pickActiveMembership([]) !== null || pickActiveMembership(null) !== null) throw new Error('empty');
});
Deno.test('1 vínculo → ele mesmo, mesmo em onboarding', () => {
  if (pickActiveMembership([m('a', '2026-01-01', 'first_contact')])?.organization?.id !== 'a') throw new Error('single');
});
Deno.test('2 vínculos → prefere onboarding concluído, mesmo sendo mais novo', () => {
  const r = pickActiveMembership([m('vazia', '2026-07-13T16:23:00Z', 'first_contact'), m('real', '2026-07-13T16:35:00Z', 'completed')]);
  if (r?.organization?.id !== 'real') throw new Error('completed first');
});
Deno.test('2 vínculos concluídos → o mais antigo, independe da ordem', () => {
  const a = m('antiga', '2026-01-01', 'completed'), b = m('nova', '2026-05-01', 'completed');
  if (pickActiveMembership([b, a])?.organization?.id !== 'antiga' || pickActiveMembership([a, b])?.organization?.id !== 'antiga') throw new Error('oldest');
});
Deno.test('vínculo sem org (RLS/org apagada) é ignorado', () => {
  const r = pickActiveMembership([{ created_at: '2026-01-01', organization: null }, m('ok', '2026-02-01', null)]);
  if (r?.organization?.id !== 'ok') throw new Error('null org');
});
