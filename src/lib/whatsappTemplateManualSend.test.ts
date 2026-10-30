// @ts-nocheck — executado com bun test
import { describe, expect, test } from 'bun:test';
import { isManualSendableTemplate } from './whatsappTemplateManualSend';

describe('isManualSendableTemplate', () => {
  test('oculta AUTHENTICATION em qualquer caixa', () => {
    expect(isManualSendableTemplate({ category: 'AUTHENTICATION' })).toBe(false);
    expect(isManualSendableTemplate({ category: 'authentication' })).toBe(false);
  });
  test('mantém outras categorias e categoria nula', () => {
    expect(isManualSendableTemplate({ category: 'MARKETING' })).toBe(true);
    expect(isManualSendableTemplate({ category: 'UTILITY' })).toBe(true);
    expect(isManualSendableTemplate({ category: null })).toBe(true);
  });
});
