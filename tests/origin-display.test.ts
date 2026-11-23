import { describe, expect, test } from 'bun:test';
import { detailParts, entryLabel, methodNote } from '../src/lib/originDisplay';

describe('originDisplay', () => {
  test('entrou por', () => {
    expect(entryLabel('ctwa')).toBe('WhatsApp');
    expect(entryLabel('meta_lead_ads')).toBe('Formulário da Meta');
    expect(entryLabel('landing_page_viagi')).toBe('Formulário do site');
    expect(entryLabel(null)).toBe('Cadastro manual');
    expect(entryLabel('kommo')).toBe('Importação');
  });
  test('detalhe em níveis, sem repetir', () => {
    expect(detailParts({ campaign_name: 'BF', adset_name: 'Mulheres', ad_name: 'Vídeo 2' })).toEqual(['BF', 'Mulheres', 'Vídeo 2']);
    expect(detailParts({ campaign_name: 'BF', adset_name: 'BF' })).toEqual(['BF']);
  });
  test('sem campanha ligada usa o nome do link, nunca macro', () => {
    expect(detailParts(null, { utm_campaign: 'black-friday' })).toEqual(['black-friday']);
    expect(detailParts(null, { utm_campaign: '{{campaign.name}}' })).toEqual([]);
  });
  test('nota do método', () => {
    expect(methodNote('inherited')).toBe('Herdada do contato');
    expect(methodNote('direct')).toBeNull();
  });
});
