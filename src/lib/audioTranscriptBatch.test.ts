import { test, expect, mock } from 'bun:test';
mock.module('@/integrations/supabase/client', () => ({ supabase: {} }));
const { createTranscriptLoader } = await import('./audioTranscriptBatch');

test('pedidos no mesmo tick viram 1 chamada, com a transcrição mais recente por id', async () => {
  const calls: string[][] = [];
  const load = createTranscriptLoader(async (ids) => {
    calls.push(ids);
    return [
      { message_id: 'a', transcript: 'velha', created_at: '2026-01-01' },
      { message_id: 'a', transcript: 'nova', created_at: '2026-01-02' },
      { message_id: 'b', transcript: 'bê', created_at: '2026-01-01' },
    ];
  });
  const r = await Promise.all([load('a'), load('b'), load('c')]);
  expect(calls.length).toBe(1);
  expect(r).toEqual(['nova', 'bê', null]);
});
