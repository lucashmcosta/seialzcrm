import { expect, test } from 'bun:test';
import { untranscribedAudios } from '../src/lib/transcriptionNotice';

const base = { providers: {}, mode: 'all_whatsapp', optedOut: false, audios7d: 37, transcriptions7d: 0 };
const ativa = { is_active: true, verified_at: '2026-11-08' };

test('avisa quando há áudios e nenhuma chave de transcrição', () => {
  expect(untranscribedAudios(base)).toBe(37);
  // Chave do Claude não transcreve.
  expect(untranscribedAudios({ ...base, providers: { anthropic: ativa } })).toBe(37);
});

test('não avisa com chave ativa de qualquer provedor de transcrição', () => {
  for (const id of ['deepgram', 'openai', 'elevenlabs']) {
    expect(untranscribedAudios({ ...base, providers: { [id]: ativa } })).toBe(0);
  }
});

test('chave inativa ou sem verificação não conta', () => {
  expect(untranscribedAudios({ ...base, providers: { deepgram: { is_active: false, verified_at: 'x' } } })).toBe(37);
  expect(untranscribedAudios({ ...base, providers: { deepgram: { is_active: true, verified_at: null } } })).toBe(37);
});

test('não avisa com transcrição desligada, org fora ou sem áudio pendente', () => {
  expect(untranscribedAudios({ ...base, mode: 'off' })).toBe(0);
  expect(untranscribedAudios({ ...base, optedOut: true })).toBe(0);
  expect(untranscribedAudios({ ...base, audios7d: 0 })).toBe(0);
  expect(untranscribedAudios({ ...base, transcriptions7d: 40 })).toBe(0);
});
