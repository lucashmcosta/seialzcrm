import { describe, expect, test } from 'bun:test';
import { getLeadOrigin } from '../src/lib/leadOrigin';

describe('getLeadOrigin', () => {
  test('formulário da Meta gravado como lead_form', () => {
    expect(getLeadOrigin({ ad_referral_source_type: 'lead_form', ad_referral_source_id: '123' }).kind).toBe('meta_form');
  });
  test('formulário mesmo com clique de WhatsApp antigo', () => {
    expect(getLeadOrigin({ ad_referral_source_type: 'lead_form', ad_referral_ctwa_clid: 'x' }).kind).toBe('meta_form');
  });
  test('lead_ad continua aceito', () => {
    expect(getLeadOrigin({ ad_referral_source_type: 'lead_ad' }).kind).toBe('meta_form');
  });
  test('anúncio que abre WhatsApp', () => {
    expect(getLeadOrigin({ ad_referral_source_type: 'ad', ad_referral_ctwa_clid: 'x' }).kind).toBe('ctwa');
  });
  test('sem sinal = orgânico', () => {
    expect(getLeadOrigin({}).kind).toBe('organic');
  });
});
