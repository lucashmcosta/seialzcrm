// Garante a fiação: cada função Meta abaixo decide a autorização ANTES de qualquer
// leitura de credencial, chamada ao Graph ou escrita, e não usa mais o getClaims
// solto (que aceitava qualquer JWT válido sem checar a org).
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FNS: Record<string, string> = {
  "meta-capi-send-event": "authorizeSendEvent(",
  "meta-capi-connect": "authorizeOrgRequest(",
  "meta-capi-connect-from-existing": "authorizeOrgRequest(",
  "meta-lead-ads-discover": "authorizeOrgRequest(",
  "meta-lead-ads-connect": "authorizeOrgRequest(",
};

const SENSITIVE = [
  ".insert(",
  ".update(",
  "metaGraphGet(",
  "resolveOrgMetaToken(admin",
  "decryptSecret(",
  "encryptSecret(",
  "fetch(",
  'from("organization_integrations")',
  'from("capi_event_log")',
];

for (const [fn, guard] of Object.entries(FNS)) {
  Deno.test(`${fn}: autorização antes de qualquer operação sensível`, async () => {
    const src = await Deno.readTextFile(new URL(`../../${fn}/index.ts`, import.meta.url));
    const handlerStart = src.indexOf("serve(");
    assert(handlerStart > 0, "serve( não encontrado");
    const body = src.slice(handlerStart);
    const g = body.indexOf(guard);
    assert(g > 0, `${guard} não chamado no handler`);
    for (const s of SENSITIVE) {
      const i = body.indexOf(s);
      assert(i === -1 || i > g, `${s} aparece antes de ${guard}`);
    }
    assert(!src.includes("getClaims"), "getClaims solto ainda presente");
    assert(!src.includes("SUPABASE_ANON_KEY"), "client anon não deveria mais ser usado p/ auth");
  });
}
