import { describe, expect, it } from 'bun:test';
import { buildTrackedLink, paramsString } from '../src/lib/trackedLink';

describe('gerador de links', () => {
  it('Meta usa as variáveis da própria Meta, sem codificar', () => {
    expect(paramsString('meta_ads', '')).toBe('utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&meta_ad_id={{ad.id}}');
  });
  it('e-mail com nome de campanha vira slug', () => {
    expect(buildTrackedLink('site.com.br/oferta', 'email', 'Black Friday 2026', 'News Semanal'))
      .toBe('https://site.com.br/oferta?utm_source=news-semanal&utm_medium=email&utm_campaign=black-friday-2026');
  });
  it('mantém parâmetros que já existem e troca os de origem', () => {
    expect(buildTrackedLink('https://site.com/?ref=1&utm_source=velho#form', 'social', 'bio', 'instagram'))
      .toBe('https://site.com/?ref=1&utm_source=instagram&utm_medium=social&utm_campaign=bio#form');
  });
  it('Google sem nome usa o id da campanha do Google', () => {
    expect(paramsString('google_ads', '')).toBe('utm_source=google&utm_medium=cpc&utm_campaign={campaignid}');
  });
  it('endereço inválido = null', () => {
    expect(buildTrackedLink('', 'email', 'x')).toBeNull();
    expect(buildTrackedLink('semponto', 'email', 'x')).toBeNull();
  });
});
