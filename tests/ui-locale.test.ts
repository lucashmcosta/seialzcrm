import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { setUiLocale, uiText, getUiLocale, uiError } from '../src/lib/ui-locale';
import { uiEnglish } from '../src/lib/ui-translations';
test('UI catalog preserves interpolation and switches without translating customer data', () => {
  for (const [source, target] of Object.entries(uiEnglish)) {
    assert.ok(target.trim(), source);
    assert.deepEqual(source.match(/\{\w+\}/g)?.sort() ?? [], target.match(/\{\w+\}/g)?.sort() ?? [], source);
  }
  setUiLocale('en-US');
  assert.equal(getUiLocale(), 'en-US');
  assert.equal(uiText('Comentários'), 'Comments');
  assert.equal(uiText('Publicado em {0}', {0: 'Instagram'}), 'Published to Instagram');
  assert.equal(uiText('A mensagem original do cliente'), 'A mensagem original do cliente');
  assert.equal(uiError(new Error('erro do provedor')), 'The operation could not be completed. Please try again.');
  setUiLocale('pt-BR');
  assert.equal(uiText('Comentários'), 'Comentários');
});
