import { test, expect } from 'bun:test';
import {
  isValidLossCode,
  lossCodeTaken,
  lossErrorMessage,
  reorderLossItems,
  stageRuleDetailOptions,
  suggestDetailCode,
  type LossDetail,
  type LossReason,
} from '../src/lib/lossReasons';

test('código segue a regra do banco', () => {
  expect(isValidLossCode('A1')).toBe(true);
  expect(isValidLossCode(' b5 ')).toBe(true);
  expect(isValidLossCode('SEM_DIREITO.1')).toBe(true);
  expect(isValidLossCode('')).toBe(false);
  expect(isValidLossCode('A 1')).toBe(false);
  expect(isValidLossCode('x'.repeat(21))).toBe(false);
});

test('código único na org sem diferenciar maiúsculas, ignorando o próprio item', () => {
  const items = [{ id: '1', code: 'A1' }, { id: '2', code: 'b2' }];
  expect(lossCodeTaken('a1', items)).toBe(true);
  expect(lossCodeTaken(' B2 ', items)).toBe(true);
  expect(lossCodeTaken('A1', items, '1')).toBe(false);
  expect(lossCodeTaken('A3', items)).toBe(false);
});

test('sugere o próximo código com o prefixo do motivo, sem reaproveitar', () => {
  expect(suggestDetailCode('A', [])).toBe('A1');
  expect(suggestDetailCode('a', ['A1', 'A2', 'B1'])).toBe('A3');
  // A7 inativo continua ocupado: a sugestão vai depois do maior número
  expect(suggestDetailCode('A', ['A1', 'A7'])).toBe('A8');
  // códigos que só começam com o prefixo, mas não são número, não contam
  expect(suggestDetailCode('A', ['AB', 'A1'])).toBe('A2');
  // prefixo grande demais para caber: sem sugestão
  expect(suggestDetailCode('X'.repeat(20), [])).toBe('');
});

test('reordenar devolve só o que mudou e renumera empates', () => {
  const items = [{ id: 'a', order_index: 1 }, { id: 'b', order_index: 2 }, { id: 'c', order_index: 3 }];
  expect(reorderLossItems(items, 'b', -1)).toEqual([{ id: 'b', order_index: 1 }, { id: 'a', order_index: 2 }]);
  expect(reorderLossItems(items, 'a', -1)).toEqual([]);
  expect(reorderLossItems(items, 'c', 1)).toEqual([]);
  const tied = [{ id: 'a', order_index: 0 }, { id: 'b', order_index: 0 }, { id: 'c', order_index: 0 }];
  expect(reorderLossItems(tied, 'c', -1)).toEqual([
    { id: 'a', order_index: 1 }, { id: 'c', order_index: 2 }, { id: 'b', order_index: 3 },
  ]);
});

test('regra por etapa só oferece detalhes ativos de motivos ativos, incluindo só automação', () => {
  const reasons: LossReason[] = [
    { id: 'r1', code: 'A', name: 'Sem direito', order_index: 1, is_active: true },
    { id: 'r2', code: 'B', name: 'Parou de responder', order_index: 2, is_active: true },
    { id: 'r3', code: 'C', name: 'Desistiu', order_index: 3, is_active: false },
  ];
  const d = (id: string, reason_id: string, extra: Partial<LossDetail> = {}): LossDetail => ({
    id, reason_id, code: id, name: id, help_text: null, order_index: 1, is_active: true,
    requires_description: false, automation_only: false, ...extra,
  });
  const groups = stageRuleDetailOptions(reasons, [
    d('A1', 'r1'), d('A2', 'r1', { is_active: false }), d('B1', 'r2', { automation_only: true }), d('C1', 'r3'),
  ]);
  expect(groups.map((g) => [g.reason.code, g.details.map((x) => x.code)])).toEqual([['A', ['A1']], ['B', ['B1']]]);
});

test('erros do banco viram texto para a pessoa', () => {
  expect(lossErrorMessage({ message: 'loss_code_in_use' })).toBe('O código já foi usado em alguma oportunidade e não pode mudar.');
  expect(lossErrorMessage({ message: 'duplicate key value violates unique constraint "opportunity_loss_reason_details_org_code_key"' }))
    .toBe('Este código já existe nesta organização (inclusive entre os inativos).');
  expect(lossErrorMessage({ message: 'new row violates row-level security policy for table "opportunity_loss_reasons"' }))
    .toBe('Você não tem permissão para alterar os motivos de perda.');
  expect(lossErrorMessage({ message: 'algo inesperado' })).toBeNull();
  expect(lossErrorMessage(null)).toBeNull();
});
