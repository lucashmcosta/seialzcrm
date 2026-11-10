import { test, expect } from 'bun:test';
import {
  lossErrorMessage,
  reorderLossItems,
  stageRuleDetailOptions,
  type LossDetail,
  type LossReason,
} from '../src/lib/lossReasons';

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
  expect(lossErrorMessage({ message: 'loss_code_immutable' })).toBe('O código é gerado automaticamente e não muda.');
  expect(lossErrorMessage({ message: 'new row violates row-level security policy for table "opportunity_loss_reasons"' }))
    .toBe('Você não tem permissão para alterar os motivos de perda.');
  expect(lossErrorMessage({ message: 'algo inesperado' })).toBeNull();
  expect(lossErrorMessage(null)).toBeNull();
});
