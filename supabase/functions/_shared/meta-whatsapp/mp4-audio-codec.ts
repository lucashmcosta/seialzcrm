// Parser mínimo de boxes MP4/M4A para identificar o codec da trilha de áudio.
//
// Motivação: a Meta Cloud API aceita `audio/mp4`, mas gravadores de navegador
// produzem MP4 com Opus dentro — a Meta aceita o upload e depois rejeita a
// mensagem com 131053. Como não há como distinguir pelo MIME nem pela extensão,
// a decisão é tomada pelo conteúdo real.
//
// Regras:
//   - sample entry `mp4a`               -> aceito (AAC, caso do iOS/Android)
//   - sample entry `Opus`, ou `dOps` em
//     qualquer nível abaixo da sample entry -> rejeitado
//   - truncado / estrutura inválida / codec
//     não identificado                  -> rejeitado (fail-closed)
//
// Módulo puro: sem I/O, sem dependência de runtime.

export type Mp4AudioVerdict =
  | { ok: true; codec: "mp4a" }
  | { ok: false; reason: Mp4AudioRejectReason };

export type Mp4AudioRejectReason =
  | "not_mp4"
  | "truncated"
  | "invalid_structure"
  | "opus_in_mp4"
  | "no_audio_track"
  | "unknown_codec";

const HEADER_BYTES = 8;
/** Boxes que apenas contêm outras boxes (percorridas recursivamente). */
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "udta", "moof", "traf"]);
/** Bytes fixos de uma AudioSampleEntry antes das boxes filhas. */
const AUDIO_SAMPLE_ENTRY_FIXED = 28;

interface Box {
  type: string;
  /** Offset do início do conteúdo (após o header). */
  start: number;
  /** Offset final exclusivo do conteúdo. */
  end: number;
}

function ascii(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function u64(bytes: Uint8Array, at: number): number {
  // Number é seguro aqui: arquivos de áudio da Meta têm no máximo 16 MB.
  return u32(bytes, at) * 0x100000000 + u32(bytes, at + 4);
}

/**
 * Lê as boxes de [from, to). Devolve null quando a cadeia é inconsistente
 * (tamanho impossível, header cortado, box que ultrapassa o limite do pai).
 */
function readBoxes(bytes: Uint8Array, from: number, to: number): Box[] | null {
  const boxes: Box[] = [];
  let at = from;
  while (at < to) {
    if (to - at < HEADER_BYTES) return null; // header cortado
    const declared = u32(bytes, at);
    const type = ascii(bytes, at + 4);
    let headerSize = HEADER_BYTES;
    let size: number;
    if (declared === 1) {
      if (to - at < 16) return null;
      size = u64(bytes, at + 8);
      headerSize = 16;
    } else if (declared === 0) {
      size = to - at; // vai até o fim do pai
    } else {
      size = declared;
    }
    if (size < headerSize) return null;
    if (at + size > to) return null; // truncado ou tamanho inconsistente
    boxes.push({ type, start: at + headerSize, end: at + size });
    at += size;
  }
  return boxes;
}

/** Procura recursivamente por `dOps` (configuração de Opus) em qualquer nível. */
function hasOpusConfig(bytes: Uint8Array, from: number, to: number, depth = 0): boolean {
  if (depth > 8) return false;
  const boxes = readBoxes(bytes, from, to);
  if (!boxes) return false;
  for (const box of boxes) {
    if (box.type === "dOps") return true;
    if (hasOpusConfig(bytes, box.start, box.end, depth + 1)) return true;
  }
  return false;
}

type Found = "mp4a" | "opus" | "other" | null;

/** Lê as sample entries de um `stsd` e classifica o codec de áudio. */
function codecFromStsd(bytes: Uint8Array, from: number, to: number): Found {
  // stsd: 1 byte version + 3 flags + 4 bytes entry_count, depois as entries.
  if (to - from < 8) return null;
  const entries = readBoxes(bytes, from + 8, to);
  if (!entries) return null;
  let fallback: Found = null;
  for (const entry of entries) {
    if (entry.type === "Opus") return "opus";
    if (entry.type === "mp4a") {
      // `dOps` abaixo de uma entry mp4a seria contraditório — trate como Opus.
      const childrenFrom = entry.start + AUDIO_SAMPLE_ENTRY_FIXED;
      if (childrenFrom <= entry.end && hasOpusConfig(bytes, childrenFrom, entry.end)) return "opus";
      return "mp4a";
    }
    // Qualquer entry cujo subárvore traga dOps é Opus.
    const childrenFrom = entry.start + AUDIO_SAMPLE_ENTRY_FIXED;
    if (childrenFrom <= entry.end && hasOpusConfig(bytes, childrenFrom, entry.end)) return "opus";
    fallback = "other";
  }
  return fallback;
}

/** Desce por containers até encontrar `stsd`; devolve o primeiro veredito relevante. */
function walkForStsd(bytes: Uint8Array, from: number, to: number, depth = 0): Found {
  if (depth > 8) return null;
  const boxes = readBoxes(bytes, from, to);
  if (!boxes) return null;
  let fallback: Found = null;
  for (const box of boxes) {
    if (box.type === "stsd") {
      const found = codecFromStsd(bytes, box.start, box.end);
      if (found === "opus" || found === "mp4a") return found;
      if (found) fallback = found;
      continue;
    }
    if (CONTAINERS.has(box.type)) {
      const found = walkForStsd(bytes, box.start, box.end, depth + 1);
      if (found === "opus" || found === "mp4a") return found;
      if (found) fallback = found;
    }
  }
  return fallback;
}

export function inspectMp4AudioCodec(bytes: Uint8Array): Mp4AudioVerdict {
  if (bytes.length < 16) return { ok: false, reason: "truncated" };

  const top = readBoxes(bytes, 0, bytes.length);
  if (!top || top.length === 0) return { ok: false, reason: "invalid_structure" };
  if (!top.some((b) => b.type === "ftyp")) return { ok: false, reason: "not_mp4" };

  const moov = top.find((b) => b.type === "moov");
  if (!moov) return { ok: false, reason: "invalid_structure" };

  const found = walkForStsd(bytes, moov.start, moov.end);
  if (found === "mp4a") return { ok: true, codec: "mp4a" };
  if (found === "opus") return { ok: false, reason: "opus_in_mp4" };
  if (found === "other") return { ok: false, reason: "unknown_codec" };
  return { ok: false, reason: "no_audio_track" };
}

/** MIMEs de entrada tratados como contêiner MP4/M4A. */
const MP4_AUDIO_ALIASES = ["audio/mp4", "audio/m4a", "audio/x-m4a"];

export function isMp4AudioMime(mime: string): boolean {
  const normalized = mime.toLowerCase().split(";")[0].trim();
  return MP4_AUDIO_ALIASES.includes(normalized);
}

/** Aliases M4A são normalizados para o único valor que sai da nossa borda. */
export function normalizeMp4AudioMime(_mime: string): string {
  return "audio/mp4";
}
