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

// Abaixo disto o texto costuma ser inventado a partir de ruído (38% em áudio inaudível,
// 96% em áudio limpo). Fica fora da tela e da análise, e o player continua lá.
export const MIN_AUDIO_CONFIDENCE = 0.6;

export function isLowConfidence(confidence: number | null | undefined): boolean {
  return typeof confidence === "number" && confidence < MIN_AUDIO_CONFIDENCE;
}

export function parseDeepgramAudio(raw: unknown, requestedModel: string): {
  text: string;
  durationSec: number;
  model: string;
  confidence: number | null;
} {
  const r = raw as {
    metadata?: { duration?: number; model_info?: Record<string, { name?: string }> };
    results?: { channels?: { alternatives?: { transcript?: string; confidence?: number }[] }[] };
  };
  const alternative = r?.results?.channels?.[0]?.alternatives?.[0];
  // O Deepgram responde o modelo que usou de fato (ex.: general-nova-3), e é por esse nome
  // que o custo é calculado.
  const names = Object.values(r?.metadata?.model_info ?? {}).map((m) => m?.name).filter(Boolean);
  return {
    text: (alternative?.transcript ?? "").trim(),
    durationSec: Number(r?.metadata?.duration) || 0,
    model: names[0] || requestedModel,
    confidence: typeof alternative?.confidence === "number" ? alternative.confidence : null,
  };
}
