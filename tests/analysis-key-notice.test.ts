import { test, expect } from 'bun:test';
import { hasAnalysisKey } from '../src/lib/transcriptionNotice';

const ok = { is_active: true, verified_at: '2026-11-09' };
test('Claude ou OpenAI ativos e verificados bastam', () => {
  expect(hasAnalysisKey({ anthropic: ok })).toBe(true);
  expect(hasAnalysisKey({ openai: ok })).toBe(true);
});
test('sem chave, chave inativa, não verificada ou só de transcrição avisa', () => {
  expect(hasAnalysisKey({})).toBe(false);
  expect(hasAnalysisKey({ anthropic: { ...ok, is_active: false } })).toBe(false);
  expect(hasAnalysisKey({ openai: { ...ok, verified_at: null } })).toBe(false);
  expect(hasAnalysisKey({ deepgram: ok })).toBe(false);
});
