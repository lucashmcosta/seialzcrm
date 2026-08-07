// meta-account-insights — insights de NÍVEL DE CONTA (read-only) para o Overview.
// Semântica correta (não somar reach por-mídia): reach = contas ÚNICAS no intervalo
// (deduplicada), views = total de reproduções/exibições. Fonte: a mesma do Business Suite.
//   Instagram: GET /{ig}/insights?metric=reach,views&period=day&metric_type=total_value&since&until
//   Facebook (best-effort; métricas de Página muito depreciadas): tenta page-level views.
// NÃO grava nada (on-demand, cacheável no cliente). Auth: x-sync-token OU JWT + membership.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { facebookAppSecret, resolveConnectionToken } from "../_shared/meta/connection.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const num = (v: unknown): number | null => v === null || v === undefined || v === "" ? null : Math.round(Number(v));
// ISO (YYYY-MM-DD) → unix segundos (UTC).
const toUnix = (s: string): number => Math.floor(new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime() / 1000);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    let connection_id = String(body.connection_id ?? "");
    const since = String(body.since ?? "");
    const until = String(body.until ?? "");
    if (!organization_id || !since || !until) return json({ error: "missing_fields" }, 400);

    const svcToken = req.headers.get("x-sync-token");
    const serviceMode = Boolean(svcToken && svcToken === Deno.env.get("META_SYNC_TRIGGER_TOKEN"));
    if (!serviceMode) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: claims, error } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (error || !claims?.claims) return json({ error: "Unauthorized" }, 401);
      const { data: user } = await admin.from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
      if (!user) return json({ error: "user_not_found" }, 403);
      const { data: m } = await admin.from("user_organizations").select("id")
        .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
      if (!m) return json({ error: "forbidden_org" }, 403);
    }
    // Resolve a conexão conectada da org quando não vier explícita.
    if (!connection_id) {
      const { data: c } = await admin.from("meta_connections").select("id")
        .eq("organization_id", organization_id).eq("status", "connected")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!c) return json({ error: "no_connected_connection" }, 404);
      connection_id = c.id;
    } else {
      const { data: conn } = await admin.from("meta_connections").select("id")
        .eq("id", connection_id).eq("organization_id", organization_id).maybeSingle();
      if (!conn) return json({ error: "connection_not_found" }, 404);
    }

    const { data: assets } = await admin.from("meta_assets")
      .select("external_id, asset_type").eq("connection_id", connection_id).eq("selection_state", "selected")
      .in("asset_type", ["page", "instagram_account"]);

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    // Sem padding no fim: janela de 30 dias precisa ficar ≤ 2.592.000s p/ reach dedup em 1 chamada.
    const s = toUnix(since), u = toUnix(until);

    const totalValue = (rows: any[], name: string): number | null => {
      const r = (rows ?? []).find((x) => x?.name === name);
      const v = r?.total_value?.value ?? r?.values?.reduce((a: number, b: any) => a + Number(b?.value ?? 0), 0);
      return v === undefined ? null : num(v);
    };

    const result: any = {
      // reach_window_limit_days: a Meta só deduplica reach de conta em janelas ≤30d.
      instagram: { reach: null, views: null, available: false, reach_window_limit_days: 30 },
      facebook: { reach: null, views: null, followers: null, available: false, reach_window_limit_days: 30 },
    };

    // Janelas de ≤30 dias (limite da API p/ account insights).
    const MAXW = 30 * 86400;
    const windows: Array<[number, number]> = [];
    for (let a = s; a < u; a += MAXW) windows.push([a, Math.min(a + MAXW, u)]);

    for (const a of assets ?? []) {
      if (a.asset_type === "instagram_account") {
        // views: aditivas → somamos as janelas. reach: dedup só cabe em 1 janela ≤30d
        // (soma de janelas superestimaria) → só reportamos reach exata quando ≤30d.
        let viewsSum = 0, viewsAny = false, reachExact: number | null = null, ok = false;
        for (const [ws, wu] of windows) {
          try {
            const r = await metaGraphGet(`/${a.external_id}/insights`,
              { metric: "reach,views", period: "day", metric_type: "total_value", since: ws, until: wu },
              { accessToken, appSecret });
            const rows = r?.data ?? [];
            const vw = totalValue(rows, "views");
            if (vw != null) { viewsSum += vw; viewsAny = true; }
            if (windows.length === 1) reachExact = totalValue(rows, "reach");
            ok = true;
          } catch (e) { result.instagram.error = (e as Error).message?.slice(0, 200); }
        }
        if (ok) {
          result.instagram.views = viewsAny ? viewsSum : null;
          result.instagram.reach = reachExact; // null quando a janela > 30d
          result.instagram.available = true;
        }
      } else {
        // Facebook Página v26 (nomes ATUAIS, confirmados empíricamente):
        //  views (media view) = page_media_view (aditiva → soma janelas);
        //  reach dedup = page_total_media_view_unique (só cabe em 1 janela ≤30d);
        //  seguidores = page_follows.
        let pageToken = accessToken;
        try {
          const pt = await metaGraphGet(`/${a.external_id}`, { fields: "access_token" }, { accessToken, appSecret });
          if (pt?.access_token) pageToken = pt.access_token;
        } catch (_) { /* usa token atual */ }
        let viewsSum = 0, viewsAny = false, reachExact: number | null = null, followers: number | null = null, ok = false;
        for (const [ws, wu] of windows) {
          try {
            const r = await metaGraphGet(`/${a.external_id}/insights`,
              { metric: "page_media_view,page_total_media_view_unique,page_follows", period: "day", metric_type: "total_value", since: ws, until: wu },
              { accessToken: pageToken, appSecret });
            const rows = r?.data ?? [];
            const vw = totalValue(rows, "page_media_view");
            if (vw != null) { viewsSum += vw; viewsAny = true; }
            if (windows.length === 1) reachExact = totalValue(rows, "page_total_media_view_unique");
            const fl = totalValue(rows, "page_follows");
            if (fl != null) followers = fl;
            ok = true;
          } catch (e) { result.facebook.error = (e as Error).message?.slice(0, 200); }
        }
        if (ok) {
          result.facebook.views = viewsAny ? viewsSum : null;
          result.facebook.reach = reachExact; // null quando a janela > 30d
          result.facebook.followers = followers;
          result.facebook.available = true;
          result.facebook.reach_window_limit_days = 30;
        }
      }
    }

    // Combinado: views soma as plataformas; reach fica por-plataforma (não é somável entre redes).
    result.combined = {
      views: (result.instagram.views ?? 0) + (result.facebook.views ?? 0),
      reach_instagram: result.instagram.reach,
      reach_facebook: result.facebook.reach,
      views_available: result.instagram.available || result.facebook.available,
    };

    return json({ success: true, graph_version: Deno.env.get("META_GRAPH_API_VERSION") || "default", since, until, ...result });
  } catch (e) {
    console.error("meta-account-insights error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
