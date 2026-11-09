import { test, expect } from 'bun:test';
import { adImageCandidates } from '../src/lib/adMedia';

test('tenta a imagem do lead antes da miniatura do Marketing', () => {
  expect(adImageCandidates('https://cdn/a.jpg', 'https://cdn/t.jpg')).toEqual(['https://cdn/a.jpg', 'https://cdn/t.jpg']);
});

test('link de página do anúncio não é imagem', () => {
  expect(adImageCandidates('https://www.facebook.com/reel/1/', 'https://cdn/t.jpg')).toEqual(['https://cdn/t.jpg']);
  expect(adImageCandidates('https://www.instagram.com/p/x/', null)).toEqual([]);
  expect(adImageCandidates(null, null)).toEqual([]);
});
