import { describe, expect, test } from 'bun:test';
import { hexToHslTriplet, hslTripletToHex, normalizeHex } from './themeColor';

describe('themeColor', () => {
  test('normalizeHex aceita 3 e 6 dígitos, com ou sem #', () => {
    expect(normalizeHex('#263B32')).toBe('#263b32');
    expect(normalizeHex('263b32')).toBe('#263b32');
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('verde')).toBeNull();
  });

  test('hexToHslTriplet bate com os presets existentes', () => {
    expect(hexToHslTriplet('#263B32')).toBe('154 22% 19%');
    expect(hexToHslTriplet('#2B40F5')).toBe('234 91% 56%');
    expect(hexToHslTriplet('#ffffff')).toBe('0 0% 100%');
    expect(hexToHslTriplet('#000')).toBe('0 0% 0%');
    expect(hexToHslTriplet('nope')).toBeNull();
  });

  test('ida e volta fica a no máximo 3 unidades por canal', () => {
    for (const hex of ['#263b32', '#2b40f5', '#c7aa7a', '#703c38', '#ff8800']) {
      const back = hslTripletToHex(hexToHslTriplet(hex)!)!;
      for (let i = 1; i < 7; i += 2) {
        expect(Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16))).toBeLessThanOrEqual(3);
      }
    }
  });

  test('hslTripletToHex rejeita formato inválido', () => {
    expect(hslTripletToHex('154, 22%, 19%')).toBeNull();
    expect(hslTripletToHex('')).toBeNull();
  });
});
