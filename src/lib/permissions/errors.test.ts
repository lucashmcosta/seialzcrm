// @ts-nocheck — executado com bun test
import { describe, it, expect } from 'bun:test';
import { rbacErrorMessage, RBAC_FALLBACK } from './errors';
describe('rbacErrorMessage', () => {
  it('traduz códigos conhecidos', () => {
    expect(rbacErrorMessage('rbac_close_denied')).toBe('Você não tem permissão para resolver esta conversa.');
    expect(rbacErrorMessage('new row violates: rbac_assign_denied')).toBe('Você não tem permissão para reatribuir esta conversa.');
  });
  it('usa texto genérico para código desconhecido', () => expect(rbacErrorMessage('rbac_export_denied')).toBe(RBAC_FALLBACK));
  it('ignora textos sem código', () => expect(rbacErrorMessage('Falha de rede')).toBeNull());
});
