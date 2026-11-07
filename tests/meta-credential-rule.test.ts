// Regra única de credencial Meta: canônico quando (flag ON) OU (sem legado utilizável);
// senão legado. Cobre resolveOrgMetaToken (flag × legado × canônico) e o helper de Ads.
Deno.env.set("META_TOKEN_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
Deno.env.set("FACEBOOK_APP_SECRET", "platform-secret");

import { resolveOrgMetaToken } from "../supabase/functions/_shared/meta/connection.ts";
import {
  normalizeAdAccountId,
  resolveOrgAdsAccess,
  syncAdAccountIds,
} from "../supabase/functions/_shared/meta/ads-access.ts";
import { encryptSecret } from "../supabase/functions/_shared/crypto.ts";

function eq(actual: unknown, expected: unknown, msg = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

type Row = Record<string, any>;
interface World {
  flag: boolean;
  routes?: Row[];
  connections?: Row[];
  credentials?: Row[];
  assets?: Row[];
  rpcCreds?: Row | null;
}

// Fake mínimo do supabase-js: filtros eq/in, order/limit ignorados, maybeSingle/thenable.
function fakeAdmin(w: World) {
  const tables: Record<string, Row[]> = {
    meta_operational_routes: w.routes ?? [],
    meta_connections: w.connections ?? [],
    meta_connection_credentials: w.credentials ?? [],
    meta_assets: w.assets ?? [],
  };
  return {
    rpc(name: string) {
      if (name === "fn_feature_flag_enabled") return Promise.resolve({ data: w.flag, error: null });
      if (name === "get_meta_credentials") return Promise.resolve({ data: [w.rpcCreds ?? { is_connected: false }], error: null });
      throw new Error("unexpected rpc " + name);
    },
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const b: any = {
        select: () => b,
        eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return b; },
        in: (k: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[k])); return b; },
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
      };
      return b;
    },
  };
}

const ORG = "00000000-0000-0000-0000-000000000001";
async function canonicalWorld(flag: boolean, extra: Partial<World> = {}): Promise<World> {
  return {
    flag,
    connections: [{
      id: "conn-1", organization_id: ORG, status: "connected", activation_state: "ready",
      last_health: "ok", granted_scopes: ["leads_retrieval", "ads_read"],
    }],
    credentials: [{ connection_id: "conn-1", token_encrypted: await encryptSecret("CANON") }],
    assets: [
      { connection_id: "conn-1", organization_id: ORG, asset_type: "ad_account", selection_state: "selected", external_id: "act_111" },
      { connection_id: "conn-1", organization_id: ORG, asset_type: "ad_account", selection_state: "selected", external_id: "222" },
      { connection_id: "conn-1", organization_id: ORG, asset_type: "page", selection_state: "selected", external_id: "p1" },
    ],
    ...extra,
  };
}
const noCanonical = (flag: boolean): World => ({ flag });
const legacyCb = (present: boolean) => async () => (present ? { token: "LEGACY" } : null);

// ---------- resolveOrgMetaToken: flag × legado × canônico ----------
Deno.test("rule: flag OFF + legado presente → legado (com ou sem canônico)", async () => {
  for (const w of [await canonicalWorld(false), noCanonical(false)]) {
    const r = await resolveOrgMetaToken(fakeAdmin(w), ORG, legacyCb(true), { capability: "capi" });
    eq(r?.source, "legacy"); eq(r?.token, "LEGACY");
  }
});
Deno.test("rule: flag OFF + sem legado + canônico saudável → canônico (no_legacy)", async () => {
  const r = await resolveOrgMetaToken(fakeAdmin(await canonicalWorld(false)), ORG, legacyCb(false), { capability: "capi" });
  eq(r?.source, "canonical"); eq(r?.token, "CANON"); eq(r?.connection_id, "conn-1"); eq(r?.appSecret, "platform-secret");
});
Deno.test("rule: flag OFF + sem legado + sem canônico → null (mesmo modo de falha de antes)", async () => {
  eq(await resolveOrgMetaToken(fakeAdmin(noCanonical(false)), ORG, legacyCb(false), { capability: "capi" }), null);
});
Deno.test("rule: flag ON + canônico saudável → canônico (com ou sem legado)", async () => {
  for (const legacy of [true, false]) {
    const r = await resolveOrgMetaToken(fakeAdmin(await canonicalWorld(true)), ORG, legacyCb(legacy), { capability: "capi" });
    eq(r?.source, "canonical");
  }
});
Deno.test("rule: flag ON + sem canônico → fallback legado / null", async () => {
  eq((await resolveOrgMetaToken(fakeAdmin(noCanonical(true)), ORG, legacyCb(true)))?.source, "legacy");
  eq(await resolveOrgMetaToken(fakeAdmin(noCanonical(true)), ORG, legacyCb(false)), null);
});
Deno.test("rule: route.source=legacy barra o canônico mesmo sem legado", async () => {
  const w = await canonicalWorld(false, { routes: [{ organization_id: ORG, route: "capi", source: "legacy", connection_id: null }] });
  eq(await resolveOrgMetaToken(fakeAdmin(w), ORG, legacyCb(false), { capability: "capi" }), null);
  const w2 = await canonicalWorld(true, { routes: [{ organization_id: ORG, route: "capi", source: "legacy", connection_id: null }] });
  eq((await resolveOrgMetaToken(fakeAdmin(w2), ORG, legacyCb(true), { capability: "capi" }))?.source, "legacy");
});
Deno.test("rule: flag ON + rota canônica estrita sem conexão → null (sem cair no legado, como antes)", async () => {
  const w: World = { flag: true, routes: [{ organization_id: ORG, route: "capi", source: "canonical", connection_id: "gone" }] };
  eq(await resolveOrgMetaToken(fakeAdmin(w), ORG, legacyCb(true), { capability: "capi" }), null);
});
Deno.test("rule: lead-generation exige leads_retrieval no canônico", async () => {
  const w = await canonicalWorld(false);
  w.connections![0].granted_scopes = ["ads_read"];
  eq(await resolveOrgMetaToken(fakeAdmin(w), ORG, legacyCb(false), { capability: "lead-generation" }), null);
});
Deno.test("rule: no_legacy nunca lança (credencial canônica corrompida → null)", async () => {
  const w = await canonicalWorld(false, { credentials: [] });
  eq(await resolveOrgMetaToken(fakeAdmin(w), ORG, legacyCb(false), { capability: "capi" }), null);
});

// ---------- helper de Ads ----------
Deno.test("ads: normalizeAdAccountId garante act_", () => {
  eq(normalizeAdAccountId("123"), "act_123");
  eq(normalizeAdAccountId(" act_123 "), "act_123");
  eq(normalizeAdAccountId(""), "");
});
Deno.test("ads: legado (flag OFF + token) → ad account salva, sync do RPC", async () => {
  const w = await canonicalWorld(false, {
    rpcCreds: { is_connected: true, system_user_token_encrypted: await encryptSecret("LEGACY"), ad_account_id: "999", feature_ads_manager_sync: true, source: "meta" },
  });
  const r = await resolveOrgAdsAccess(fakeAdmin(w), ORG);
  if (!r.ok) throw new Error("expected ok");
  eq(r.access.source, "legacy"); eq(r.access.token, "LEGACY"); eq(r.access.adAccountIds, ["act_999"]);
  eq(r.access.syncEnabled, true); eq(syncAdAccountIds(r.access), ["act_999"]);
});
Deno.test("ads: sem legado → canônico com todas as ad accounts selecionadas (act_)", async () => {
  const r = await resolveOrgAdsAccess(fakeAdmin(await canonicalWorld(false)), ORG);
  if (!r.ok) throw new Error("expected ok");
  eq(r.access.source, "canonical"); eq(r.access.reason, "no_legacy"); eq(r.access.token, "CANON");
  eq(r.access.adAccountIds, ["act_111", "act_222"]); eq(r.access.syncEnabled, true);
  eq(syncAdAccountIds(r.access), ["act_111", "act_222"]);
});
Deno.test("ads: linha legada sem token conta como 'sem legado' → canônico; ad account salva restringe o sync", async () => {
  const w = await canonicalWorld(false, {
    rpcCreds: { is_connected: true, system_user_token_encrypted: null, ad_account_id: "act_222", raw_config_values: { feature_ads_manager_sync: true } },
  });
  const r = await resolveOrgAdsAccess(fakeAdmin(w), ORG);
  if (!r.ok) throw new Error("expected ok");
  eq(r.access.source, "canonical"); eq(syncAdAccountIds(r.access), ["act_222"]);
});
Deno.test("ads: canônico respeita sync desligado explicitamente", async () => {
  const w = await canonicalWorld(false, { rpcCreds: { is_connected: true, raw_config_values: { feature_ads_manager_sync: false } } });
  const r = await resolveOrgAdsAccess(fakeAdmin(w), ORG);
  if (!r.ok) throw new Error("expected ok");
  eq(r.access.syncEnabled, false);
});
Deno.test("ads: flag ON → canônico mesmo com legado; sem canônico cai no legado", async () => {
  const legacyCreds = { is_connected: true, system_user_token_encrypted: await encryptSecret("LEGACY"), ad_account_id: "999", feature_ads_manager_sync: true };
  const r1 = await resolveOrgAdsAccess(fakeAdmin(await canonicalWorld(true, { rpcCreds: legacyCreds })), ORG);
  if (!r1.ok) throw new Error("expected ok");
  eq(r1.access.source, "canonical"); eq(r1.access.reason, "flag");
  const r2 = await resolveOrgAdsAccess(fakeAdmin({ flag: true, rpcCreds: legacyCreds }), ORG);
  if (!r2.ok) throw new Error("expected ok");
  eq(r2.access.source, "legacy");
});
Deno.test("ads: nenhum dos dois → no_credential; legado corrompido → decrypt_failed", async () => {
  const r1 = await resolveOrgAdsAccess(fakeAdmin({ flag: false }), ORG);
  eq(r1.ok ? null : r1.reason, "no_credential");
  const r2 = await resolveOrgAdsAccess(fakeAdmin({ flag: false, rpcCreds: { is_connected: true, system_user_token_encrypted: "v1:bad:bad" } }), ORG);
  eq(r2.ok ? null : r2.reason, "decrypt_failed");
});
Deno.test("ads: loader legado customizado (enrich/meta-lead-ads) é respeitado", async () => {
  const enc = await encryptSecret("LEAD");
  const r = await resolveOrgAdsAccess(fakeAdmin(await canonicalWorld(false)), ORG, {
    loadLegacy: async () => ({ tokenEncrypted: enc, adAccountId: null, syncEnabled: true, source: "meta-lead-ads" }),
  });
  if (!r.ok) throw new Error("expected ok");
  eq(r.access.source, "legacy"); eq(r.access.token, "LEAD");
});
