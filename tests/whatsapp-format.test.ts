import { expect, test } from 'bun:test';
import { parseWhatsAppText as p, stripWhatsAppFormatting as strip } from '../src/lib/whatsappFormat';

const t = (text: string) => ({ type: 'text', text });

test('negrito, itálico e riscado', () => {
  expect(p('No plano *Advance*, ok')).toEqual([t('No plano '), { type: 'bold', children: [t('Advance')] }, t(', ok')]);
  expect(p('_oi_')).toEqual([{ type: 'italic', children: [t('oi')] }]);
  expect(p('~oi~')).toEqual([{ type: 'strike', children: [t('oi')] }]);
});

test('combinados', () => {
  expect(p('*_oi_*')).toEqual([{ type: 'bold', children: [{ type: 'italic', children: [t('oi')] }] }]);
});

test('o caso real: negrito com parênteses e dois-pontos', () => {
  const nodes = p('• *Vacina múltipla (V8 ou V10)*: carência de *90 dias*, *1 dose*');
  expect(nodes.filter((n) => n.type === 'bold').length).toBe(3);
  expect(strip('*Vacina múltipla (V8 ou V10)*: carência')).toBe('Vacina múltipla (V8 ou V10): carência');
});

test('não formata no meio de palavra, com espaço encostado ou entre linhas', () => {
  expect(p('2*3*4')).toEqual([t('2*3*4')]);
  expect(p('nome_do_arquivo')).toEqual([t('nome_do_arquivo')]);
  expect(p('* oi *')).toEqual([t('• oi *')]);
  expect(p('*oi\ntudo*')).toEqual([t('*oi\ntudo*')]);
  expect(p('5 * 3')).toEqual([t('5 * 3')]);
});

test('mono', () => {
  expect(p('```a *b*```')).toEqual([{ type: 'code', text: 'a *b*' }]);
  expect(p('`x`')).toEqual([{ type: 'code', text: 'x' }]);
});

test('lista com hífen ou asterisco vira marcador', () => {
  expect(p('- um\n* dois')).toEqual([t('• um\n• dois')]);
});

test('links: sem formatar dentro, sem pontuação final e sem aspas', () => {
  expect(p('veja https://a.com/x_y_z.')).toEqual([t('veja '), { type: 'link', href: 'https://a.com/x_y_z', text: 'https://a.com/x_y_z' }, t('.')]);
  const evil = p('https://a.com/"onmouseover="alert(1)');
  expect(evil[0]).toEqual({ type: 'link', href: 'https://a.com/', text: 'https://a.com/' });
  expect(p('javascript:alert(1)')).toEqual([t('javascript:alert(1)')]);
});

test('HTML do cliente continua sendo texto', () => {
  expect(p('<img src=x onerror=alert(1)>')).toEqual([t('<img src=x onerror=alert(1)>')]);
});

test('marcador sem par fica como digitado', () => {
  expect(p('*oi')).toEqual([t('*oi')]);
  expect(strip('')).toBe('');
});
