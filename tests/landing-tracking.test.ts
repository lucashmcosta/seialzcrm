import { describe, expect, it } from 'bun:test';
import { trackingFromLanding } from '../supabase/functions/_shared/landing-tracking';

describe('trackingFromLanding', () => {
  it('tira UTMs e cliques do endereço da página', () => {
    expect(trackingFromLanding('https://site.com/lp?utm_source=fb&utm_medium=paid&utm_campaign=Black&fbclid=abc&x=1', {}))
      .toEqual({ utm_source: 'fb', utm_medium: 'paid', utm_campaign: 'Black', fbclid: 'abc' });
  });
  it('o que o cliente mandou vence o endereço', () => {
    expect(trackingFromLanding('https://site.com/?utm_source=google', { utm_source: 'ig', foo: 'bar' })).toEqual({ utm_source: 'ig' });
  });
  it('endereço inválido ou vazio não quebra', () => {
    expect(trackingFromLanding('não é url', null)).toEqual({});
    expect(trackingFromLanding(undefined, undefined)).toEqual({});
  });
});
