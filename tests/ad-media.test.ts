import { test, expect } from 'bun:test';
import { adImageCandidates } from '../src/lib/adMedia';

const LARGE = 'https://cdn/t.jpg?stp=c0.5000x0.5000f_dst-emg0_p1080x1080_q75_tt6';
const SMALL = 'https://cdn/t.jpg?stp=c0.5000x0.5000f_dst-emg0_p64x64_q75_tt6';

test('prefere a miniatura grande, que não expira entre sincronizações', () => {
  expect(adImageCandidates('https://cdn/a.jpg', LARGE)).toEqual([LARGE, 'https://cdn/a.jpg']);
});

test('miniatura de 64px só entra depois da imagem do lead', () => {
  expect(adImageCandidates('https://cdn/a.jpg', SMALL)).toEqual(['https://cdn/a.jpg', SMALL]);
});

test('link de página do anúncio não é imagem', () => {
  expect(adImageCandidates('https://www.facebook.com/reel/1/', LARGE)).toEqual([LARGE]);
  expect(adImageCandidates('https://www.instagram.com/p/x/', null)).toEqual([]);
  expect(adImageCandidates(null, null)).toEqual([]);
});
