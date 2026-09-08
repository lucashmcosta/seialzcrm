import { describe, it, expect } from 'vitest';
import {
  inspectMp4AudioCodec,
  isMp4AudioMime,
  normalizeMp4AudioMime,
} from '../supabase/functions/_shared/meta-whatsapp/mp4-audio-codec';

// Construtor de boxes MP4 para fixtures determinísticas.
function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  const body = payloads.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(8 + body);
  const size = out.length;
  out[0] = (size >>> 24) & 0xff;
  out[1] = (size >>> 16) & 0xff;
  out[2] = (size >>> 8) & 0xff;
  out[3] = size & 0xff;
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let at = 8;
  for (const p of payloads) { out.set(p, at); at += p.length; }
  return out;
}

const bytes = (...n: number[]) => new Uint8Array(n);
const zeros = (n: number) => new Uint8Array(n);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

const ftyp = box('ftyp', new Uint8Array([...'M4A '].map((c) => c.charCodeAt(0))), zeros(8));
/** stsd: version/flags (4) + entry_count (4) + entries */
const stsd = (...entries: Uint8Array[]) => box('stsd', zeros(4), bytes(0, 0, 0, entries.length), ...entries);
/** AudioSampleEntry: 28 bytes fixos, depois boxes filhas */
const sampleEntry = (type: string, ...children: Uint8Array[]) => box(type, zeros(28), ...children);
const moovWith = (stsdBox: Uint8Array) =>
  box('moov', box('trak', box('mdia', box('minf', box('stbl', stsdBox)))));

describe('inspectMp4AudioCodec', () => {
  it('aceita AAC (mp4a) como trilha de áudio', () => {
    const file = concat(ftyp, moovWith(stsd(sampleEntry('mp4a', box('esds', zeros(10))))));
    expect(inspectMp4AudioCodec(file)).toEqual({ ok: true, codec: 'mp4a' });
  });

  it('aceita mesmo quando o moov está no fim do arquivo', () => {
    const mdat = box('mdat', zeros(2048));
    const file = concat(ftyp, mdat, moovWith(stsd(sampleEntry('mp4a'))));
    expect(inspectMp4AudioCodec(file)).toEqual({ ok: true, codec: 'mp4a' });
  });

  it('bloqueia Opus como sample entry', () => {
    const file = concat(ftyp, moovWith(stsd(sampleEntry('Opus', box('dOps', zeros(11))))));
    expect(inspectMp4AudioCodec(file)).toEqual({ ok: false, reason: 'opus_in_mp4' });
  });

  it('bloqueia quando dOps aparece aninhado abaixo da sample entry', () => {
    const nested = box('wave', box('frma', zeros(4)), box('dOps', zeros(11)));
    const file = concat(ftyp, moovWith(stsd(sampleEntry('xxxx', nested))));
    expect(inspectMp4AudioCodec(file)).toEqual({ ok: false, reason: 'opus_in_mp4' });
  });

  it('bloqueia codec desconhecido', () => {
    const file = concat(ftyp, moovWith(stsd(sampleEntry('samr'))));
    expect(inspectMp4AudioCodec(file)).toEqual({ ok: false, reason: 'unknown_codec' });
  });

  it('bloqueia arquivo sem moov', () => {
    const file = concat(ftyp, box('mdat', zeros(64)));
    expect(inspectMp4AudioCodec(file)).toEqual({ ok: false, reason: 'invalid_structure' });
  });

  it('bloqueia arquivo truncado (fail-closed)', () => {
    const full = concat(ftyp, moovWith(stsd(sampleEntry('mp4a'))));
    const cut = full.slice(0, full.length - 12);
    expect(inspectMp4AudioCodec(cut).ok).toBe(false);
  });

  it('bloqueia arquivo muito pequeno', () => {
    expect(inspectMp4AudioCodec(zeros(8))).toEqual({ ok: false, reason: 'truncated' });
  });

  it('bloqueia conteúdo que não é MP4 (ex.: OGG)', () => {
    const ogg = concat(new Uint8Array([...'OggS'].map((c) => c.charCodeAt(0))), zeros(60));
    expect(inspectMp4AudioCodec(ogg).ok).toBe(false);
  });

  it('bloqueia moov sem trilha de áudio', () => {
    const file = concat(ftyp, box('moov', box('trak', box('mdia', box('minf', box('stbl', box('stts', zeros(8))))))));
    expect(inspectMp4AudioCodec(file)).toEqual({ ok: false, reason: 'no_audio_track' });
  });
});

describe('MIMEs MP4/M4A', () => {
  it('reconhece os três aliases, com ou sem parâmetros', () => {
    for (const m of ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/mp4; codecs=mp4a.40.2', 'AUDIO/MP4']) {
      expect(isMp4AudioMime(m)).toBe(true);
    }
  });

  it('não reconhece ogg, webm nem outros', () => {
    for (const m of ['audio/ogg', 'audio/ogg; codecs=opus', 'audio/webm', 'audio/aac', 'audio/mpeg', 'audio/amr']) {
      expect(isMp4AudioMime(m)).toBe(false);
    }
  });

  it('normaliza qualquer alias para audio/mp4', () => {
    expect(normalizeMp4AudioMime('audio/x-m4a')).toBe('audio/mp4');
    expect(normalizeMp4AudioMime('audio/m4a')).toBe('audio/mp4');
  });
});
