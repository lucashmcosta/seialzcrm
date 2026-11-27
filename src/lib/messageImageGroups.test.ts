// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { groupConsecutiveImages, type AlbumCandidate } from './messageImageGroups';

const base = new Date('2026-11-27T12:00:00Z').getTime();
const img = (min: number, over: Partial<AlbumCandidate> = {}): AlbumCandidate => ({
  isMessage: true, direction: 'inbound', senderId: null, mediaType: 'image',
  mediaUrls: ['https://x/a.jpg'], content: '📷 Imagem', sentAt: base + min * 60000, ...over,
});

describe('groupConsecutiveImages', () => {
  it('agrupa 4 imagens seguidas', () => {
    expect(groupConsecutiveImages([img(0), img(0), img(1), img(1)]).get(0)).toEqual([0, 1, 2, 3]);
  });
  it('não agrupa 3 imagens', () => {
    expect(groupConsecutiveImages([img(0), img(0), img(1)]).size).toBe(0);
  });
  it('legenda quebra o grupo', () => {
    expect(groupConsecutiveImages([img(0), img(0), img(0, { content: 'olha' }), img(0), img(0)]).size).toBe(0);
  });
  it('sentido ou remetente diferente quebra', () => {
    expect(groupConsecutiveImages([img(0), img(0), img(0, { direction: 'outbound' }), img(0)]).size).toBe(0);
    expect(groupConsecutiveImages([img(0, { senderId: 'a' }), img(0, { senderId: 'a' }), img(0, { senderId: 'b' }), img(0, { senderId: 'a' })]).size).toBe(0);
  });
  it('intervalo maior que 5 minutos quebra', () => {
    expect(groupConsecutiveImages([img(0), img(1), img(2), img(8)]).size).toBe(0);
  });
  it('nota no meio quebra', () => {
    expect(groupConsecutiveImages([img(0), img(0), { ...img(0), isMessage: false }, img(0), img(0)]).size).toBe(0);
  });
});
