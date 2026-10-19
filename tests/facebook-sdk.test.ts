import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { facebookLocale, loadFacebookSdk, reloadForFacebookLocale } from '../src/lib/facebook-sdk';
test('SDK retries after failure, shares loading and reloads on locale change', async () => {
  const elements = new Map<string, any>(); let reloads = 0; let initCount = 0;
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = { setTimeout, clearTimeout, location: {reload: () => reloads++}, FB: {init: () => initCount++} } as any;
  globalThis.document = {getElementById: (id: string) => elements.get(id), createElement: () => { const e: any = {}; e.remove = () => elements.delete(e.id); return e; }, body: {appendChild: (e: any) => elements.set(e.id,e)}} as any;
  try {
    assert.equal(facebookLocale('pt-BR'), 'pt_BR');
    const failed = loadFacebookSdk('app','v26.0','en-US');
    elements.get('facebook-jssdk').onerror();
    await assert.rejects(failed);
    const p = loadFacebookSdk('app','v26.0','en-US');
    assert.equal(loadFacebookSdk('app','v26.0','en-US'), p);
    assert.ok(elements.get('facebook-jssdk').src.includes('/en_US/'));
    window.fbAsyncInit(); await p; assert.equal(initCount,1);
    reloadForFacebookLocale('pt-BR'); assert.equal(reloads,1);
  } finally { globalThis.window = oldWindow; globalThis.document = oldDocument; }
});
