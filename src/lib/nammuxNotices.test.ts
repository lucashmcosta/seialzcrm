// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { noticeKindLabel, noticeSituation, pendingCount, previewProblemText, type NoticeItem } from './nammuxNotices';

const item = (over: Partial<NoticeItem>): NoticeItem => ({
  id: 'a', kind: 'movement_unfavorable', status: 'pending_approval', statusReason: null, sendAt: '2026-12-10T12:00:00Z',
  expiresAt: null, attempts: 0, channel: null, lastError: null, createdAt: '2026-12-10T12:00:00Z', contactId: 'c',
  contactName: null, opportunityId: null, preview: 'texto', previewProblem: null, canApprove: true, ...over,
});

describe('avisos ao cliente', () => {
  test('o contador do menu só conta o que espera uma pessoa', () => {
    expect(pendingCount([
      item({ status: 'pending_approval' }), item({ status: 'needs_review' }), item({ status: 'dead_letter' }),
      item({ status: 'skipped', statusReason: 'no_template' }),
    ])).toBe(3);
    expect(pendingCount([])).toBe(0);
  });

  test('cada situação tem uma frase que diz o que aconteceu', () => {
    expect(noticeSituation(item({ status: 'pending_approval' }))).toContain('Aguardando aprovação');
    expect(noticeSituation(item({ status: 'needs_review', statusReason: 'unknown_outcome' }))).toContain('Não sabemos se este aviso chegou');
    expect(noticeSituation(item({ status: 'needs_review', statusReason: 'payment_reversed_after_sent' }))).toContain('pagamento foi estornado');
    expect(noticeSituation(item({ status: 'dead_letter' }))).toContain('5 tentativas');
    expect(noticeSituation(item({ status: 'skipped', statusReason: 'no_template' }))).toContain('falta um modelo');
    expect(noticeSituation(item({ status: 'skipped', statusReason: 'template_problem:template_not_approved' }))).toContain('problema na Meta');
    expect(noticeSituation(item({ status: 'skipped', statusReason: 'do_not_contact' }))).toContain('pediu para não ser contatado');
    expect(noticeSituation(item({ status: 'skipped', statusReason: 'algo_novo' }))).toBe('Não saiu.');
  });

  test('rótulos e problemas de prévia têm texto, mesmo para valor desconhecido', () => {
    expect(noticeKindLabel('installment_overdue')).toBe('A empresa não pagou');
    expect(noticeKindLabel('tipo_novo')).toBe('tipo_novo');
    expect(previewProblemText('subject_changed')).toContain('A situação mudou');
    expect(previewProblemText('outro')).toBe('Não foi possível montar a mensagem.');
    expect(previewProblemText(null)).toBeNull();
  });
});
