// meta-capi-list-pixels — lista os Pixels das contas de anúncio selecionadas em Ativos,
// usando a mesma credencial canônica que envia os eventos. Só leitura: nada é gravado.
// Devolve também a Página e o WABA da org para preencher a configuração.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeOrgRequest } from "../_shared/auth/membership.ts";
import { graphPaginate, resolveConnectionWithAsset, resolveOrgMetaToken } from "../_shared/meta/connection.ts";
import { mergePixels, singleOrNull } from "../_shared/meta/pixels.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const organization_id = body?.organization_id ? String(body.organization_id) : "";
    if (!organization_id) return json({ error: "missing_fields" }, 400);

    const authz = await authorizeOrgRequest(req, admin, organization_id);
    if (!authz.ok) return json({ error: authz.status === 401 ? "Unauthorized" : authz.error }, authz.status);

    // Sem legado aqui: esta lista só existe no modo canônico (o legado segue com ID manual).
    const resolved = await resolveOrgMetaToken(admin, organization_id, async () => null, { capability: "capi" });
    if (!resolved) return json({ reason: "no_connection", pixels: [], defaults: {} });

    // Página selecionada (na conexão que a operação usa) e WABA já conectado na org.
    const pageConn = await resolveConnectionWithAsset(admin, organization_id, "page");
    const { data: pages } = pageConn
      ? await admin.from("meta_assets").select("external_id")
        .eq("connection_id", pageConn.connection_id).eq("organization_id", organization_id)
        .eq("asset_type", "page").eq("selection_state", "selected")
      : { data: [] };
    const { data: whatsapp } = await admin.from("organization_integrations")
      .select("connected_account, admin_integrations!inner(slug)")
      .eq("organization_id", organization_id).eq("is_enabled", true)
      .eq("admin_integrations.slug", "meta-whatsapp-cloud").maybeSingle();
    const defaults = {
      page_id: singleOrNull(((pages ?? []) as any[]).map((p) => p.external_id)),
      whatsapp_business_account_id: (whatsapp?.connected_account as any)?.waba_id ?? null,
    };

    const adConn = await resolveConnectionWithAsset(admin, organization_id, "ad_account");
    if (!adConn) return json({ reason: "no_ad_account", pixels: [], defaults });
    const { data: accounts, error: accountsError } = await admin.from("meta_assets")
      .select("external_id, name")
      .eq("connection_id", adConn.connection_id).eq("organization_id", organization_id)
      .eq("asset_type", "ad_account").eq("selection_state", "selected");
    if (accountsError) throw new Error("asset_lookup_failed");

    const results = await Promise.allSettled(((accounts ?? []) as any[]).map(async (account) => ({
      ad_account_name: account.name ?? null,
      rows: await graphPaginate(
        `/${account.external_id}/adspixels`,
        { fields: "id,name,last_fired_time", limit: 100 },
        resolved.token,
        resolved.appSecret,
        { maxPages: 5 },
      ),
    })));
    const ok = results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
    const failed = results.length - ok.length;
    for (const r of results) {
      if (r.status === "rejected") console.warn("meta-capi-list-pixels account_failed", (r.reason as Error)?.message);
    }
    return json({
      reason: ok.length === 0 && failed > 0 ? "meta_error" : null,
      failed_accounts: failed,
      pixels: mergePixels(ok),
      defaults,
    });
  } catch (e) {
    console.error("meta-capi-list-pixels error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
