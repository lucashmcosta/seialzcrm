// Texto que a análise deve ler de uma mensagem. Áudio guarda só "[Áudio]" em messages.content;
// o que foi dito está em audio_transcriptions. Regras puras, em tests/audio-content.test.ts.
const PLACEHOLDERS = new Set(["[áudio]", "[audio]", "🎵 áudio", "🎵 audio"]);

export function isAudioMessage(mediaType: string | null | undefined): boolean {
  return (mediaType ?? "").toLowerCase().startsWith("audio");
}

export function effectiveContent(p: {
  content: string | null | undefined;
  mediaType: string | null | undefined;
  transcript?: string | null;
}): { content: string; source: "message" | "transcript" | "none" } {
  const content = (p.content ?? "").trim();
  if (!isAudioMessage(p.mediaType)) return { content, source: "message" };
  const transcript = (p.transcript ?? "").trim();
  if (transcript) return { content: transcript, source: "transcript" };
  // Áudios antigos podem ter o texto gravado na própria mensagem.
  if (content && !PLACEHOLDERS.has(content.toLowerCase())) return { content, source: "message" };
  return { content: "", source: "none" };
}

// Reanálise troca os sinais antigos da mensagem pelos novos, sem duplicar.
export const ANALYSIS_EVENT_TYPES = [
  "objection_detected",
  "buying_signal_detected",
  "human_handoff_suggested",
  "negative_sentiment_detected",
];
