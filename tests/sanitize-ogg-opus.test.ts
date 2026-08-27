import { describe, it, expect } from 'vitest';
import {
  sanitizeOggOpusBytes,
  parseOggPages,
  oggCrc32,
  verifyOggCrcs,
  isSendableOggOpus,
} from '../src/lib/sanitizeOggOpus';

// ---------------------------------------------------------------------------
// Synthetic Ogg fixtures (RFC 3533 page layout), built with correct CRCs.
// ---------------------------------------------------------------------------

interface PageSpec {
  headerType: number; // 0x02 BOS, 0x04 EOS
  granule: number;
  sequence: number;
  /** Packet payload lengths; a length of 0 becomes a single `0` lacing value. */
  packets: number[];
  serial?: number;
}

function buildPage(spec: PageSpec, fill = 0xa5): Uint8Array {
  const segments: number[] = [];
  const body: number[] = [];
  for (const length of spec.packets) {
    let remaining = length;
    while (remaining >= 255) {
      segments.push(255);
      remaining -= 255;
    }
    segments.push(remaining);
    for (let i = 0; i < length; i++) body.push((fill + i) & 0xff);
  }
  if (segments.length > 255) throw new Error('fixture page overflow');

  const page = new Uint8Array(27 + segments.length + body.length);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);
  page[4] = 0;
  page[5] = spec.headerType;
  let granule = BigInt(spec.granule);
  for (let i = 0; i < 8; i++) {
    page[6 + i] = Number(granule & 0xffn);
    granule >>= 8n;
  }
  const serial = spec.serial ?? 0x1234abcd;
  page[14] = serial & 0xff;
  page[15] = (serial >>> 8) & 0xff;
  page[16] = (serial >>> 16) & 0xff;
  page[17] = (serial >>> 24) & 0xff;
  page[18] = spec.sequence & 0xff;
  page[19] = (spec.sequence >>> 8) & 0xff;
  page[20] = (spec.sequence >>> 16) & 0xff;
  page[21] = (spec.sequence >>> 24) & 0xff;
  page[26] = segments.length;
  page.set(segments, 27);
  page.set(body, 27 + segments.length);
  const crc = oggCrc32(page);
  page[22] = crc & 0xff;
  page[23] = (crc >>> 8) & 0xff;
  page[24] = (crc >>> 16) & 0xff;
  page[25] = (crc >>> 24) & 0xff;
  return page;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Concatenated body bytes of every page — the actual audio payload. */
function payloadOf(bytes: Uint8Array): Uint8Array {
  const pages = parseOggPages(bytes);
  if (!pages) throw new Error('unparseable fixture');
  return concat(
    ...pages.map((p) =>
      bytes.slice(p.offset + p.headerLength, p.offset + p.headerLength + p.bodyLength),
    ),
  );
}

const bosPage = () => buildPage({ headerType: 0x02, granule: 0, sequence: 0, packets: [19] });
const tagsPage = () => buildPage({ headerType: 0x00, granule: 0, sequence: 1, packets: [24] });

/** The real-world defect: EOS page whose segment table ends with a `0`. */
const defectiveStream = () =>
  concat(
    bosPage(),
    tagsPage(),
    buildPage({ headerType: 0x04, granule: 96000, sequence: 2, packets: [65, 65, 0] }),
  );

const healthyStream = () =>
  concat(
    bosPage(),
    tagsPage(),
    buildPage({ headerType: 0x04, granule: 96000, sequence: 2, packets: [65, 65] }),
  );

describe('sanitizeOggOpusBytes', () => {
  it('fixes an OGG with a trailing zero-length packet', () => {
    const input = defectiveStream();
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(true);
    expect(result.reason).toBe('fixed_trailing_empty_packet');
    expect(result.bytes.length).toBe(input.length - 1);

    const pages = parseOggPages(result.bytes)!;
    expect(pages).toHaveLength(3);
    expect(pages[2].segments).toEqual([65, 65]);
    expect(pages[2].headerType & 0x04).toBe(0x04);
    expect(isSendableOggOpus(result.bytes)).toEqual({ ok: true });
  });

  it('leaves an already valid OGG byte-for-byte unchanged', () => {
    const input = healthyStream();
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('already_valid');
    expect(result.bytes).toEqual(input);
    expect(isSendableOggOpus(input)).toEqual({ ok: true });
  });

  it('does not attempt to fix a truncated stream', () => {
    const input = defectiveStream().slice(0, defectiveStream().length - 10);
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('structure_invalid');
    expect(result.bytes).toEqual(input);
    expect(isSendableOggOpus(input).ok).toBe(false);
  });

  it('does not attempt to fix a stream with trailing garbage', () => {
    const input = concat(defectiveStream(), new Uint8Array([1, 2, 3, 4, 5]));
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('structure_invalid');
  });

  it('does not attempt to fix a stream with a bad structure version', () => {
    const input = defectiveStream();
    input[4] = 0x01;
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('structure_invalid');
  });

  it('rejects non-OGG input', () => {
    const input = new Uint8Array(4096).fill(0x42);
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('not_ogg');
  });

  it('rejects a stream whose last page is not flagged EOS', () => {
    const input = concat(
      bosPage(),
      tagsPage(),
      buildPage({ headerType: 0x00, granule: 96000, sequence: 2, packets: [65, 65, 0] }),
    );
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('last_page_not_eos');
    expect(result.bytes).toEqual(input);
  });

  it('preserves a `0` lacing that terminates a 255-multiple packet', () => {
    // A 255-byte packet is laced as [255, 0]; that trailing 0 is meaningful.
    const input = concat(
      bosPage(),
      tagsPage(),
      buildPage({ headerType: 0x04, granule: 96000, sequence: 2, packets: [65, 255] }),
    );
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('trailing_zero_is_packet_terminator');
    expect(result.bytes).toEqual(input);
  });

  it('refuses a page whose whole segment table is a single zero', () => {
    const input = concat(
      bosPage(),
      tagsPage(),
      buildPage({ headerType: 0x04, granule: 96000, sequence: 2, packets: [0] }),
    );
    const result = sanitizeOggOpusBytes(input);

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('unsafe_single_segment_page');
  });

  it('produces valid CRCs on every page after the fix', () => {
    const result = sanitizeOggOpusBytes(defectiveStream());
    expect(result.changed).toBe(true);
    expect(verifyOggCrcs(result.bytes)).toBe(true);
  });

  it('keeps the Opus payload byte-for-byte identical', () => {
    const input = defectiveStream();
    const result = sanitizeOggOpusBytes(input);
    expect(result.changed).toBe(true);
    expect(payloadOf(result.bytes)).toEqual(payloadOf(input));
  });

  it('is idempotent: a second run returns the same bytes', () => {
    const first = sanitizeOggOpusBytes(defectiveStream());
    const second = sanitizeOggOpusBytes(first.bytes);

    expect(second.changed).toBe(false);
    expect(second.reason).toBe('already_valid');
    expect(second.bytes).toEqual(first.bytes);
    expect(second.bytes.length).toBe(first.bytes.length);
  });

  it('detects a zero-length packet in the middle of the stream as unsendable', () => {
    const input = concat(
      bosPage(),
      tagsPage(),
      buildPage({ headerType: 0x00, granule: 48000, sequence: 2, packets: [65, 0, 65] }),
      buildPage({ headerType: 0x04, granule: 96000, sequence: 3, packets: [65] }),
    );
    expect(isSendableOggOpus(input).ok).toBe(false);
  });
});
