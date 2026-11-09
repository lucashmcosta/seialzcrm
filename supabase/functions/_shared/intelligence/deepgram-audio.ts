// Deepgram para áudio de WhatsApp: um falante só, enviado como arquivo. Regras puras,
// testadas em tests/deepgram-audio.test.ts. A ligação tem regras próprias (dois canais)
// em telephony-transcribe-call.

export function deepgramAudioQuery(model: string): string {
  return new URLSearchParams({
    model,
    language: "pt-BR",
    punctuate: "true",
    // Igual às ligações: `smart_format` troca número por extenso por dígito e estraga a
    // fala ("uma construtora" virava "1 construtora"). Pontuação sim, número não.
    smart_format: "false",
    numerals: "false",
  }).toString();
}

// A mídia pode vir sem tipo ou como octet-stream, e áudio de WhatsApp é ogg/opus.
export function audioContentType(blobType: string | null | undefined): string {
  const type = (blobType ?? "").toLowerCase();
  return type.startsWith("audio/") || type.startsWith("video/") ? blobType! : "audio/ogg";
}

export function parseDeepgramAudio(raw: unknown, requestedModel: string): {
  text: string;
  durationSec: number;
  model: string;
} {
  const r = raw as {
    metadata?: { duration?: number; model_info?: Record<string, { name?: string }> };
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
  };
  // O Deepgram responde o modelo que usou de fato (ex.: general-nova-3), e é por esse nome
  // que o custo é calculado.
  const names = Object.values(r?.metadata?.model_info ?? {}).map((m) => m?.name).filter(Boolean);
  return {
    text: (r?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim(),
    durationSec: Number(r?.metadata?.duration) || 0,
    model: names[0] || requestedModel,
  };
}
