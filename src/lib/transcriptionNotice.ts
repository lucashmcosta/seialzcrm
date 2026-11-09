// Quando avisar que os áudios não estão sendo transcritos (tests/transcription-notice.test.ts).
// A transcrição exige chave própria de um destes provedores (resolve-provider.ts).
const TRANSCRIPTION_PROVIDERS = ['deepgram', 'openai', 'elevenlabs'];

type KeyInfo = { is_active?: boolean; verified_at?: string | null };

export function untranscribedAudios(p: {
  providers: Record<string, KeyInfo | undefined>;
  mode: string;
  optedOut: boolean;
  audios7d: number;
  transcriptions7d: number;
}): number {
  if (p.mode === 'off' || p.optedOut) return 0;
  const hasKey = TRANSCRIPTION_PROVIDERS.some((id) => p.providers[id]?.is_active && p.providers[id]?.verified_at);
  return hasKey ? 0 : Math.max(p.audios7d - p.transcriptions7d, 0);
}

/** A análise de mensagens só roda com chave ativa e verificada do Claude ou da OpenAI. */
export function hasAnalysisKey(keys: Record<string, { is_active: boolean; verified_at: string | null } | undefined>): boolean {
  return ['openai', 'anthropic'].some((p) => keys[p]?.is_active && !!keys[p]?.verified_at);
}
