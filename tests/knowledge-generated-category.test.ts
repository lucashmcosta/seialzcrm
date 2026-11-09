import { test, expect } from 'bun:test';
import { categoryForGeneratedDoc, VALID_CATEGORIES } from '../src/lib/knowledge-categories';

test('todos os tipos gerados viram uma categoria que o banco aceita', () => {
  expect(categoryForGeneratedDoc('general')).toBe('general');
  expect(categoryForGeneratedDoc('product')).toBe('product_service');
  expect(categoryForGeneratedDoc('policy')).toBe('policies');
  expect(categoryForGeneratedDoc('faq')).toBe('faq');
  expect(categoryForGeneratedDoc('faq_only')).toBe('faq');
});
test('tipo desconhecido ou vazio não quebra o salvamento', () => {
  for (const t of ['geral', '', null, undefined]) expect(VALID_CATEGORIES).toContain(categoryForGeneratedDoc(t));
});
