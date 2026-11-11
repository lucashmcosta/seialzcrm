import {
  EMBEDDED_SOURCE,
  findMovedNumberRow,
  generateTwoStepPin,
  planEmbeddedWrite,
  resolveSignupAssets,
  toE164,
  wabaIdsFromGranularScopes,
} from '../supabase/functions/_shared/meta-whatsapp/embedded-signup.ts';

function same(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}

const ORG = 'org-1';
const phones = (map: Record<string, string[]>) => (w: string) => map[w] ?? [];

Deno.test('granular scopes: only whatsapp_business_management target_ids are WABAs', () => {
  same(wabaIdsFromGranularScopes([
    { scope: 'whatsapp_business_management', target_ids: ['111', '222'] },
    { scope: 'whatsapp_business_messaging', target_ids: ['phone-9'] },
    { scope: 'business_management', target_ids: ['biz'] },
  ]), ['111', '222']);
  same(wabaIdsFromGranularScopes(null), []);
  same(wabaIdsFromGranularScopes([{ scope: 'whatsapp_business_management' }]), []);
});

Deno.test('assets: session hint must be authorized by the token', () => {
  same(resolveSignupAssets({ sessionWabaId: '999', sessionPhoneNumberId: 'p1', grantedWabaIds: ['111'], wabaPhoneIds: phones({}) }),
    { ok: false, error: 'waba_not_granted' });
  same(resolveSignupAssets({ sessionWabaId: '111', sessionPhoneNumberId: 'p1', grantedWabaIds: ['111'], wabaPhoneIds: () => ['p1'] }),
    { ok: true, wabaId: '111', phoneNumberId: 'p1' });
  same(resolveSignupAssets({ sessionWabaId: '111', sessionPhoneNumberId: 'px', grantedWabaIds: ['111'], wabaPhoneIds: () => ['p1'] }),
    { ok: false, error: 'phone_not_in_waba' });
});

Deno.test('assets: without session info, falls back to the single granted WABA/number', () => {
  same(resolveSignupAssets({ grantedWabaIds: ['111'], wabaPhoneIds: phones({ '111': ['p1'] }) }),
    { ok: true, wabaId: '111', phoneNumberId: 'p1' });
  same(resolveSignupAssets({ grantedWabaIds: ['111', '222'], wabaPhoneIds: phones({}) }), { ok: false, error: 'multiple_wabas' });
  same(resolveSignupAssets({ grantedWabaIds: ['111'], wabaPhoneIds: phones({ '111': ['p1', 'p2'] }) }), { ok: false, error: 'multiple_phone_numbers' });
  same(resolveSignupAssets({ grantedWabaIds: ['111'], wabaPhoneIds: phones({ '111': [] }) }), { ok: false, error: 'no_phone_number' });
  same(resolveSignupAssets({ grantedWabaIds: [], wabaPhoneIds: phones({}) }), { ok: false, error: 'no_waba_granted' });
});

Deno.test('toE164 normalizes Meta display numbers', () => {
  same(toE164('+55 11 99999-9999'), '+5511999999999');
  same(toE164('1 (650) 555-1234'), '+16505551234');
  same(toE164('123'), null);
  same(toE164(null), null);
});

const ep = (o: Partial<{ id: string; organization_id: string; organization_integration_id: string | null; provider: string }>) => ({
  id: 'ep-1', organization_id: ORG, organization_integration_id: 'oi-1', provider: 'meta_cloud_api', sender_sid: 'p1', ...o,
});

Deno.test('write plan: fresh org inserts', () => {
  same(planEmbeddedWrite({ organizationId: ORG, existingWaba: null, endpointByPhoneId: null, endpointByAddress: null }), { action: 'insert' });
});

Deno.test('write plan: reconnecting the same embedded WABA reauthorizes in place (idempotent)', () => {
  const e = ep({});
  same(planEmbeddedWrite({ organizationId: ORG, existingWaba: { id: 'oi-1', source: EMBEDDED_SOURCE }, endpointByPhoneId: e, endpointByAddress: e }),
    { action: 'reauthorize', organizationIntegrationId: 'oi-1', endpointId: 'ep-1' });
  same(planEmbeddedWrite({ organizationId: ORG, existingWaba: { id: 'oi-1', source: EMBEDDED_SOURCE }, endpointByPhoneId: null, endpointByAddress: null }),
    { action: 'reauthorize', organizationIntegrationId: 'oi-1', endpointId: null });
});

Deno.test('write plan: never takes over a manually connected WABA', () => {
  same(planEmbeddedWrite({ organizationId: ORG, existingWaba: { id: 'oi-1', source: null }, endpointByPhoneId: null, endpointByAddress: null }),
    { action: 'conflict', error: 'waba_connected_manually' });
  same(planEmbeddedWrite({ organizationId: ORG, existingWaba: { id: 'oi-1', source: 'add_waba' }, endpointByPhoneId: null, endpointByAddress: null }).action,
    'conflict');
});

Deno.test('write plan: number owned elsewhere is refused', () => {
  same(planEmbeddedWrite({ organizationId: ORG, existingWaba: null, endpointByPhoneId: ep({ organization_id: 'org-2' }), endpointByAddress: null }),
    { action: 'conflict', error: 'phone_in_other_org' });
  same(planEmbeddedWrite({ organizationId: ORG, existingWaba: null, endpointByPhoneId: ep({}), endpointByAddress: null }).action, 'conflict');
  same(planEmbeddedWrite({ organizationId: ORG, existingWaba: null, endpointByPhoneId: null, endpointByAddress: ep({ id: 'ep-twilio', provider: 'twilio' }) }),
    { action: 'conflict', error: 'address_in_use', existingEndpointId: 'ep-twilio', existingProvider: 'twilio' });
});

Deno.test('two-step PIN is always 6 digits', () => {
  for (let i = 0; i < 200; i++) {
    const pin = generateTwoStepPin();
    if (!/^\d{6}$/.test(pin)) throw new Error(pin);
  }
});

import { multiWabaEnabledFor } from '../supabase/functions/_shared/meta-whatsapp/embedded-signup.ts';
import { isFacebookOrigin, parseEmbeddedSignupMessage } from '../src/lib/whatsapp-embedded-signup.ts';

Deno.test('multi-WABA flag mirrors the frontend hook', () => {
  same(multiWabaEnabledFor(null, ORG), false);
  same(multiWabaEnabledFor({ is_enabled: false, organization_ids: [] }, ORG), false);
  same(multiWabaEnabledFor({ is_enabled: true, organization_ids: [] }, ORG), true);
  same(multiWabaEnabledFor({ is_enabled: true, organization_ids: ['other'] }, ORG), false);
  same(multiWabaEnabledFor({ is_enabled: true, organization_ids: [ORG] }, ORG), true);
});

Deno.test('session message: only real facebook.com origins are trusted', () => {
  same(isFacebookOrigin('https://www.facebook.com'), true);
  same(isFacebookOrigin('https://facebook.com'), true);
  same(isFacebookOrigin('https://evilfacebook.com'), false);
  same(isFacebookOrigin('https://facebook.com.evil.io'), false);
  same(isFacebookOrigin('http://www.facebook.com'), false);
  same(isFacebookOrigin('garbage'), false);
});

Deno.test('session message: parses FINISH, CANCEL and ignores unrelated messages', () => {
  const finish = JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '111', phone_number_id: 'p1', business_id: 'b1' } });
  same(parseEmbeddedSignupMessage('https://www.facebook.com', finish),
    { event: 'FINISH', wabaId: '111', phoneNumberId: 'p1', businessId: 'b1', currentStep: null, errorMessage: null });
  same(parseEmbeddedSignupMessage('https://evilfacebook.com', finish), null);
  same(parseEmbeddedSignupMessage('https://www.facebook.com', { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE_NUMBER_SETUP' } })?.currentStep,
    'PHONE_NUMBER_SETUP');
  same(parseEmbeddedSignupMessage('https://www.facebook.com', 'not json'), null);
  same(parseEmbeddedSignupMessage('https://www.facebook.com', JSON.stringify({ type: 'OTHER' })), null);
});

import { platformAppSecretFor } from '../supabase/functions/_shared/meta-whatsapp/credentials.ts';

Deno.test('app secret: existing integrations (own app) keep the stored secret path untouched', () => {
  const env = (k: string) => (k === 'FACEBOOK_APP_SECRET' ? 'platform-secret' : undefined);
  // null = "não se aplica" → resolveAppSecretForIntegration decripta connected_account como antes.
  same(platformAppSecretFor({ app_secret_encrypted: 'enc', source: undefined }, env), null);
  same(platformAppSecretFor({ app_secret_encrypted: 'enc', source: 'add_waba' }, env), null);
  same(platformAppSecretFor(null, env), null);
  same(platformAppSecretFor(undefined, env), null);
});

Deno.test('app secret: embedded signup reads the platform secret from env at runtime (no reconnect on rotation)', () => {
  same(platformAppSecretFor({ source: 'embedded_signup', app_secret_encrypted: null }, () => 'v1'), 'v1');
  same(platformAppSecretFor({ source: 'embedded_signup', app_secret_encrypted: null }, () => 'v2-rotated'), 'v2-rotated');
  same(platformAppSecretFor({ source: 'embedded_signup' }, () => undefined), undefined);
});

Deno.test('número que mudou de conta na Meta reaproveita a linha antiga', () => {
  const org = 'org-1';
  const rows = [{ id: 'oi-velha', connected_account: { source: EMBEDDED_SOURCE, waba_id: 'waba-velha' } }];
  const ep = { id: 'ep-1', organization_id: org, organization_integration_id: 'oi-velha', provider: 'meta_cloud_api', sender_sid: 'pn-1' };
  same(findMovedNumberRow({ organizationId: org, hasRowForNewWaba: false, endpointByPhoneId: ep, orgRows: rows })?.id, 'oi-velha');
  // Com a linha antiga re-apontada, o plano re-autoriza o mesmo número.
  same(planEmbeddedWrite({
    organizationId: org,
    existingWaba: { id: 'oi-velha', source: EMBEDDED_SOURCE },
    endpointByPhoneId: ep,
    endpointByAddress: ep,
  }), { action: 'reauthorize', organizationIntegrationId: 'oi-velha', endpointId: 'ep-1' });
});

Deno.test('não reaproveita linha em outros casos', () => {
  const org = 'org-1';
  const rows = [{ id: 'oi-velha', connected_account: { source: EMBEDDED_SOURCE } }];
  const ep = { id: 'ep-1', organization_id: org, organization_integration_id: 'oi-velha', provider: 'meta_cloud_api', sender_sid: 'pn-1' };
  same(findMovedNumberRow({ organizationId: org, hasRowForNewWaba: true, endpointByPhoneId: ep, orgRows: rows }), null);
  same(findMovedNumberRow({ organizationId: org, hasRowForNewWaba: false, endpointByPhoneId: null, orgRows: rows }), null);
  same(findMovedNumberRow({ organizationId: org, hasRowForNewWaba: false, endpointByPhoneId: { ...ep, organization_id: 'outra' }, orgRows: rows }), null);
  const manual = [{ id: 'oi-velha', connected_account: { source: 'manual' } }];
  same(findMovedNumberRow({ organizationId: org, hasRowForNewWaba: false, endpointByPhoneId: ep, orgRows: manual }), null);
});
