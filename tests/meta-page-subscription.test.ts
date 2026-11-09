import { ensurePageSubscribed, fieldsToSubscribe, PAGE_WEBHOOK_FIELDS } from '../supabase/functions/_shared/meta/page-subscription.ts';

const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };

async function withGraph(apps: unknown[], run: (posts: string[]) => Promise<void>) {
  const original = globalThis.fetch;
  const posts: string[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(new URLSearchParams(String(init.body)).get('subscribed_fields') ?? ''); return new Response('{"success":true}'); }
    return new Response(JSON.stringify({ data: apps }));
  }) as typeof fetch;
  try { await run(posts); } finally { globalThis.fetch = original; }
}
const opts = { pageToken: 'token', appId: 'nosso' };

Deno.test('fields already subscribed need no write', () => eq(fieldsToSubscribe(PAGE_WEBHOOK_FIELDS), null));
Deno.test('existing fields are kept when adding the missing ones', () => {
  eq(fieldsToSubscribe(['leadgen', 'messages']), ['leadgen', 'messages', 'feed', 'mention', 'messaging_postbacks', 'message_reactions']);
});
Deno.test('page without our app gets subscribed', () => withGraph([], async (posts) => {
  eq(await ensurePageSubscribed('p', opts), 'subscribed');
  eq(posts, [PAGE_WEBHOOK_FIELDS.join(',')]);
}));
Deno.test('page already subscribed writes nothing', () => withGraph([{ id: 'nosso', subscribed_fields: PAGE_WEBHOOK_FIELDS }], async (posts) => {
  eq(await ensurePageSubscribed('p', opts), 'already');
  eq(posts, []);
}));
Deno.test('another app on the page does not count as ours', () => withGraph([{ id: 'outro', subscribed_fields: PAGE_WEBHOOK_FIELDS }], async (posts) => {
  eq(await ensurePageSubscribed('p', opts), 'subscribed');
  eq(posts.length, 1);
}));
