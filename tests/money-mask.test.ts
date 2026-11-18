import { describe, expect, test } from 'bun:test';
import { currencySymbol, formatMoneyInput, maskMoneyInput, parseMoneyInput } from '../src/lib/moneyMask';

describe('máscara de dinheiro', () => {
  test('pt-BR: milhar entra enquanto digita, centavos com vírgula', () => {
    expect(maskMoneyInput('1', 'pt-BR')).toBe('1');
    expect(maskMoneyInput('1900', 'pt-BR')).toBe('1.900');
    expect(maskMoneyInput('1900000', 'pt-BR')).toBe('1.900.000');
    expect(maskMoneyInput('1900,5', 'pt-BR')).toBe('1.900,5');
    expect(maskMoneyInput('1900,507', 'pt-BR')).toBe('1.900.507');
    expect(maskMoneyInput('1.900', 'pt-BR')).toBe('1.900');
    expect(maskMoneyInput('1900.5', 'pt-BR')).toBe('1.900,5');
    expect(maskMoneyInput('abc', 'pt-BR')).toBe('');
    expect(maskMoneyInput('007', 'pt-BR')).toBe('7');
  });

  test('en-US: vírgula de milhar e ponto decimal', () => {
    expect(maskMoneyInput('1900', 'en-US')).toBe('1,900');
    expect(maskMoneyInput('1900.5', 'en-US')).toBe('1,900.5');
  });

  test('converte para número e volta', () => {
    expect(parseMoneyInput('1.900,50', 'pt-BR')).toBe(1900.5);
    expect(parseMoneyInput('1,900.50', 'en-US')).toBe(1900.5);
    expect(parseMoneyInput('', 'pt-BR')).toBeNull();
    expect(formatMoneyInput(1900, 'pt-BR')).toBe('1.900');
    expect(formatMoneyInput(1900.5, 'pt-BR')).toBe('1.900,50');
    expect(formatMoneyInput(null, 'pt-BR')).toBe('');
  });

  test('símbolo da moeda', () => {
    expect(currencySymbol('BRL', 'pt-BR')).toBe('R$');
    expect(currencySymbol('USD', 'en-US')).toBe('$');
  });
});
