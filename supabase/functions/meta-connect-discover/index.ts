// meta-connect-discover — descobre ativos (Businesses, Ad Accounts, Pages, Instagram)
// e popula meta_assets como 'discovered'. Preserva selection_state de ativos já
// selecionados/desabilitados (discovery != selection). verify_jwt=true.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  facebookAppSecret,
  graphPaginate,
  resolveConnectionToken,
  withRetry,
} from "../_shared/meta/connection.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Discovered {
  asset_type: "business" | "ad_account" | "page" | "instagram_account";
  external_id: string;
  name: string | null;
  metadata: Record<string, unknown>;
  parent_external_id: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    const connection_id = String(body.connection_id ?? "");
    if (!organization_id || !connection_id) return json({ error: "missing_fields" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: user } = await admin
      .from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
    if (!user) return json({ error: "user_not_found" }, 403);
    const { data: membership } = await admin
      .from("user_organizations").select("id")
      .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!membership) return json({ error: "forbidden_org" }, 403);

    // Confere que a conexão é da org.
    const { data: conn } = await admin
      .from("meta_connections").select("id").eq("id", connection_id)
      .eq("organization_id", organization_id).maybeSingle();
    if (!conn) return json({ error: "connection_not_found" }, 404);

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    const found: Discovered[] = [];

    // Businesses
    try {
      const businesses = await graphPaginate("/me/businesses", { fields: "id,name" }, accessToken, appSecret);
      for (const b of businesses) {
        found.push({ asset_type: "business", external_id: String(b.id), name: b.name ?? null, metadata: {}, parent_external_id: null });
      }
    } catch (_) { /* segue com o que der */ }

    // Ad Accounts
    try {
      const accounts = await graphPaginate(
        "/me/adaccounts",
        { fields: "id,account_id,name,currency,timezone_name,account_status,business" },
        accessToken, appSecret,
      );
      for (const a of accounts) {
        found.push({
          asset_type: "ad_account",
          external_id: String(a.id), // formato act_...
          name: a.name ?? null,
          metadata: {
            account_id: a.account_id ?? null,
            currency: a.currency ?? null,
            timezone_name: a.timezone_name ?? null,
            account_status: a.account_status ?? null,
          },
          parent_external_id: a.business?.id ? String(a.business.id) : null,
        });
      }
    } catch (_) { /* */ }

    // Pages + Instagram (por página)
    try {
      const pages = await graphPaginate("/me/accounts", { fields: "id,name,category" }, accessToken, appSecret);
      for (const p of pages) {
        const pageId = String(p.id);
        found.push({ asset_type: "page", external_id: pageId, name: p.name ?? null, metadata: { category: p.category ?? null }, parent_external_id: null });
        // Instagram Professional associado à página
        try {
          const ig = await withRetry(() => metaGraphGet(`/${pageId}`, { fields: "instagram_business_account{id,username,name}" }, { accessToken, appSecret }));
          const iba = ig?.instagram_business_account;
          if (iba?.id) {
            found.push({
              asset_type: "instagram_account",
              external_id: String(iba.id),
              name: iba.name ?? iba.username ?? null,
              metadata: { username: iba.username ?? null },
              parent_external_id: pageId,
            });
          }
        } catch (_) { /* página sem IG */ }
      }
    } catch (_) { /* */ }

    // Upsert preservando selection_state: existentes só atualizam name/metadata.
    const { data: existing } = await admin
      .from("meta_assets").select("id, asset_type, external_id")
      .eq("connection_id", connection_id);
    const existingMap = new Map<string, string>(); // key `${type}:${extid}` -> id
    for (const e of existing ?? []) existingMap.set(`${e.asset_type}:${e.external_id}`, e.id);

    for (const a of found) {
      const key = `${a.asset_type}:${a.external_id}`;
      if (existingMap.has(key)) {
        await admin.from("meta_assets")
          .update({ name: a.name, metadata: a.metadata })
          .eq("id", existingMap.get(key)!);
      } else {
        const { data: ins } = await admin.from("meta_assets")
          .insert({
            organization_id, connection_id,
            asset_type: a.asset_type, external_id: a.external_id,
            name: a.name, metadata: a.metadata, selection_state: "discovered",
          }).select("id").single();
        if (ins) existingMap.set(key, ins.id);
      }
    }

    // Segundo passo: resolve parent_asset_id.
    for (const a of found) {
      if (!a.parent_external_id) continue;
      const childId = existingMap.get(`${a.asset_type}:${a.external_id}`);
      // pai pode ser business (p/ ad_account) ou page (p/ instagram)
      const parentKey = a.asset_type === "instagram_account"
        ? `page:${a.parent_external_id}`
        : `business:${a.parent_external_id}`;
      const parentId = existingMap.get(parentKey);
      if (childId && parentId) {
        await admin.from("meta_assets").update({ parent_asset_id: parentId }).eq("id", childId);
      }
    }

    const counts = found.reduce((acc: Record<string, number>, a) => {
      acc[a.asset_type] = (acc[a.asset_type] ?? 0) + 1; return acc;
    }, {});

    return json({ success: true, connection_id, discovered: counts });
  } catch (e) {
    console.error("meta-connect-discover error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
