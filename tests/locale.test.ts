import { resolveLocale, profileName } from '../src/lib/locale.ts';
Deno.test('locale precedence, inheritance and invalid values', () => {
  for (const [u, o, expected] of [['pt-BR','en-US','pt-BR'],['en-US','pt-BR','en-US'],[null,'en-US','en-US'],['','en-US','en-US'],['invalid','invalid','pt-BR']]) {
    if (resolveLocale(u, o) !== expected) throw new Error('locale precedence');
  }
});
Deno.test('changing language cannot erase a full-name-only profile', () => {
  const n = profileName('Maria Silva', '', '');
  if (n.full_name !== 'Maria Silva' || n.last_name !== 'Silva') throw new Error('name lost');
});
