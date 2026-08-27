// Conservative OGG/Opus container sanitizer.
//
// Root cause it addresses (measured on real files rejected by Meta with 131053):
// `opus-media-recorder@0.8.0` finalizes the stream by appending a ZERO-LENGTH
// packet — the last page's segment table ends with a lacing value of `0`.
// A zero-length Opus packet is invalid per RFC 6716, so strict parsers reject
// the whole stream: ffmpeg reports `Packet processing failed: Invalid data
// found when processing input`, and Meta reclassifies the upload as
// `application/octet-stream`.
//
// The fix is container-level surgery ONLY: drop that trailing `0` lacing value,
// decrement `page_segments`, recompute the page CRC. No audio payload byte is
// ever touched, nothing is re-encoded, no transcode is involved.
//
// The sanitizer is deliberately paranoid: it corrects the file only when EVERY
// structural precondition holds, and otherwise returns the bytes untouched with
// a reason code. It never attempts a generic "repair".

export type SanitizeReason =
  /** Trailing zero-length packet removed; CRC recomputed. */
  | 'fixed_trailing_empty_packet'
  /** Valid OGG stream with no trailing zero-length packet — nothing to do. */
  | 'already_valid'
  /** Not an OGG stream at all (no `OggS` capture pattern at offset 0). */
  | 'not_ogg'
  /** Page chain does not parse cleanly / does not end exactly at EOF. */
  | 'structure_invalid'
  /** Last page is not flagged end-of-stream. */
  | 'last_page_not_eos'
  /** The trailing `0` lacing terminates a 255-multiple packet — meaningful, keep. */
  | 'trailing_zero_is_packet_terminator'
  /** Removing the lacing would leave a page with an empty segment table. */
  | 'unsafe_single_segment_page';

export interface SanitizeResult {
  bytes: Uint8Array;
  changed: boolean;
  reason: SanitizeReason;
}

export interface OggPage {
  /** Absolute offset of the page's `OggS` capture pattern. */
  offset: number;
  headerType: number;
  granulePosition: bigint;
  serial: number;
  sequence: number;
  crc: number;
  segments: number[];
  /** 27 + page_segments */
  headerLength: number;
  bodyLength: number;
}

const OGG_S = [0x4f, 0x67, 0x67, 0x53]; // "OggS"
const HEADER_TYPE_EOS = 0x04;

// ---------------------------------------------------------------------------
// Ogg CRC32: polynomial 0x04c11db7, MSB-first, init 0, no final xor, no
// reflection. The CRC field itself must be zeroed while computing.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = (i << 24) >>> 0;
    for (let k = 0; k < 8; k++) {
      c = c & 0x80000000 ? (((c << 1) >>> 0) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function oggCrc32(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (((crc << 8) >>> 0) ^ CRC_TABLE[((crc >>> 24) & 0xff) ^ bytes[i]]) >>> 0;
  }
  return crc >>> 0;
}

function readU32LE(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
  );
}

function writeU32LE(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >>> 8) & 0xff;
  bytes[at + 2] = (value >>> 16) & 0xff;
  bytes[at + 3] = (value >>> 24) & 0xff;
}

/**
 * Walk the Ogg page chain. Returns `null` when the stream is not a clean,
 * complete chain of pages ending exactly at the end of the buffer (truncated,
 * padded, or corrupted input).
 */
export function parseOggPages(bytes: Uint8Array): OggPage[] | null {
  if (bytes.length < 27) return null;
  for (let i = 0; i < 4; i++) if (bytes[i] !== OGG_S[i]) return null;

  const pages: OggPage[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 27 > bytes.length) return null;
    for (let i = 0; i < 4; i++) if (bytes[offset + i] !== OGG_S[i]) return null;
    if (bytes[offset + 4] !== 0x00) return null; // stream structure version must be 0

    const pageSegments = bytes[offset + 26];
    const headerLength = 27 + pageSegments;
    if (offset + headerLength > bytes.length) return null;

    const segments: number[] = [];
    let bodyLength = 0;
    for (let i = 0; i < pageSegments; i++) {
      const lacing = bytes[offset + 27 + i];
      segments.push(lacing);
      bodyLength += lacing;
    }
    if (offset + headerLength + bodyLength > bytes.length) return null;

    let granulePosition = 0n;
    for (let i = 7; i >= 0; i--) {
      granulePosition = (granulePosition << 8n) | BigInt(bytes[offset + 6 + i]);
    }

    pages.push({
      offset,
      headerType: bytes[offset + 5],
      granulePosition,
      serial: readU32LE(bytes, offset + 14),
      sequence: readU32LE(bytes, offset + 18),
      crc: readU32LE(bytes, offset + 22),
      segments,
      headerLength,
      bodyLength,
    });

    offset += headerLength + bodyLength;
  }

  // Must consume the buffer exactly — no trailing garbage, no truncation.
  if (offset !== bytes.length || pages.length === 0) return null;
  return pages;
}

/** Recompute and write the CRC of the page starting at `offset`, in place. */
function rewritePageCrc(bytes: Uint8Array, offset: number, length: number): void {
  writeU32LE(bytes, offset + 22, 0);
  const crc = oggCrc32(bytes.subarray(offset, offset + length));
  writeU32LE(bytes, offset + 22, crc);
}

/** True when every page's stored CRC matches a freshly computed one. */
export function verifyOggCrcs(bytes: Uint8Array): boolean {
  const pages = parseOggPages(bytes);
  if (!pages) return false;
  for (const page of pages) {
    const length = page.headerLength + page.bodyLength;
    const copy = bytes.slice(page.offset, page.offset + length);
    writeU32LE(copy, 22, 0);
    if (oggCrc32(copy) !== page.crc) return false;
  }
  return true;
}

/**
 * Remove the trailing zero-length Opus packet from an OGG stream, when — and
 * only when — every structural precondition holds. Idempotent: running it on
 * an already-sanitized buffer returns the buffer unchanged (`already_valid`).
 */
export function sanitizeOggOpusBytes(bytes: Uint8Array): SanitizeResult {
  const pages = parseOggPages(bytes);
  if (!pages) {
    const looksOgg = bytes.length >= 4 && OGG_S.every((b, i) => bytes[i] === b);
    return { bytes, changed: false, reason: looksOgg ? 'structure_invalid' : 'not_ogg' };
  }

  const last = pages[pages.length - 1];

  // The defect only ever occurs on the final, end-of-stream page.
  if ((last.headerType & HEADER_TYPE_EOS) === 0) {
    return { bytes, changed: false, reason: 'last_page_not_eos' };
  }

  const segments = last.segments;
  if (segments.length === 0 || segments[segments.length - 1] !== 0) {
    return { bytes, changed: false, reason: 'already_valid' };
  }
  // A page whose whole segment table is a single `0` is not the defect we know.
  if (segments.length < 2) {
    return { bytes, changed: false, reason: 'unsafe_single_segment_page' };
  }
  // A `0` lacing right after a `255` legitimately terminates a packet whose
  // length is an exact multiple of 255 — removing it would corrupt the stream.
  if (segments[segments.length - 2] === 255) {
    return { bytes, changed: false, reason: 'trailing_zero_is_packet_terminator' };
  }

  // Safe to drop: a `0` lacing contributes zero body bytes, so every audio
  // payload byte keeps its exact value (only its offset shifts by one).
  const cutAt = last.offset + last.headerLength - 1; // index of the trailing `0`
  const out = new Uint8Array(bytes.length - 1);
  out.set(bytes.subarray(0, cutAt), 0);
  out.set(bytes.subarray(cutAt + 1), cutAt);
  out[last.offset + 26] = segments.length - 1; // page_segments -= 1
  rewritePageCrc(out, last.offset, last.headerLength - 1 + last.bodyLength);

  return { bytes: out, changed: true, reason: 'fixed_trailing_empty_packet' };
}

export interface SanitizeBlobResult {
  blob: Blob;
  changed: boolean;
  reason: SanitizeReason;
}

/** Blob wrapper around {@link sanitizeOggOpusBytes}; preserves the MIME type. */
export async function sanitizeOggOpusBlob(blob: Blob): Promise<SanitizeBlobResult> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const result = sanitizeOggOpusBytes(bytes);
  if (!result.changed) return { blob, changed: false, reason: result.reason };
  return {
    blob: new Blob([result.bytes as unknown as BlobPart], { type: blob.type }),
    changed: true,
    reason: result.reason,
  };
}

/**
 * Post-sanitize gate: the stream must parse, end on an EOS page, and contain no
 * zero-length packet anywhere. Used to fail closed before sending.
 */
export function isSendableOggOpus(
  bytes: Uint8Array,
): { ok: true } | { ok: false; reason: string } {
  const pages = parseOggPages(bytes);
  if (!pages) return { ok: false, reason: 'estrutura ogg inválida' };
  const last = pages[pages.length - 1];
  if ((last.headerType & HEADER_TYPE_EOS) === 0) {
    return { ok: false, reason: 'última página sem EOS' };
  }

  // Reconstruct packet lengths across pages: a packet ends on a lacing < 255.
  let current = 0;
  for (const page of pages) {
    for (const lacing of page.segments) {
      current += lacing;
      if (lacing < 255) {
        if (current === 0) return { ok: false, reason: 'pacote de comprimento zero' };
        current = 0;
      }
    }
  }
  return { ok: true };
}
