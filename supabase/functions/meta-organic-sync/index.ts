// meta-organic-sync — leitura orgânica (read-only) de Pages + Instagram Professional
// selecionados: media (posts/reels) + insights → meta_media/meta_media_insights.
//
// PAGINAÇÃO SEM TETO ARTIFICIAL: percorre TODOS os cursores (`paging.next`) até o fim
// real da coleção. Sem MAX_MEDIA, sem maxPages, sem corte por dias no backfill.
//   BACKFILL  → do mais recente ao mais antigo que a Meta disponibilizar; idempotente;
//               retomável por checkpoint (meta_sync_state.cursor); "completo" só quando
//               a API não devolve mais `paging.next`.
//   INCREMENTAL→ após backfill, busca só o que é novo desde o watermark (não reprocessa
//               todo o histórico).
// O único limite é OPERACIONAL (orçamento de tempo por invocação + rate limit): ao
// atingi-lo, salva o cursor e AUTO-CONTINUA numa nova execução (headless) até terminar.
// verify_jwt=true. Fases futuras: publish/comments/DM.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  classifyMetaError,
  facebookAppSecret,
  GRAPH_API_VERSION,
  PARSER_VERSION,
  resolveConnectionToken,
  SYNC_VERSION,
  withRetry,
} from "../_shared/meta/connection.ts";
import { metaGraphGet, MetaGraphError } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const toInt = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Math.round(Number(v));

// Orçamento de tempo por invocação (operacional, NÃO um limite de conteúdo). Ao estourar,
// salvamos o cursor e continuamos em outra execução. Folga sob o teto de wall-time do edge.
const TIME_BUDGET_MS = 110_000;
const PAGE_LIMIT = 50; // tamanho de página do Graph; NÃO limita o total (seguimos todos os cursores).
// Backstop anti-loop de auto-continuação (guarda de segurança; muito acima de qualquer
// conta real — a coleta termina naturalmente por backfill_done bem antes disso).
const MAX_CHAIN = 1000;

// Extrai um valor de um array de insights do Graph (name -> values[0].value).
function pickMetric(rows: any[], names: string[]): number | null {
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (names.includes(r?.name)) {
      const v = r?.values?.[0]?.value ?? r?.total_value?.value;
      if (v !== undefined) {
        return toInt(typeof v === "object" ? Object.values(v).reduce((a: any, b: any) => a + Number(b), 0) : v);
      }
    }
  }
  return null;
}

// Busca uma página: primeira via metaGraphGet (aplica appsecret_proof); próximas via a
// URL completa de paging.next (já traz access_token, como no graphPaginate). withRetry em ambas.
async function fetchPage(
  nextUrl: string | null,
  firstPage: () => Promise<any>,
): Promise<any> {
  if (nextUrl) {
    return await withRetry(async () => {
      const res = await fetch(nextUrl, { method: "GET" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new MetaGraphError(res.status, j.error || { message: `HTTP ${res.status}` });
      return j;
    });
  }
  return await withRetry(firstPage);
}

interface OrgCursor {
  phase: "backfill" | "incremental";
  media_next: string | null; // URL da PÁGINA ainda não processada (null = primeira página)
  backfill_done: boolean;
  watermark_id: string | null; // external_id da mídia mais recente já ingerida
  watermark_ts: string | null;
  pages: number; // cursores percorridos (cumulativo)
}
function initCursor(c: any): OrgCursor {
  return {
    phase: c?.phase === "incremental" ? "incremental" : "backfill",
    media_next: typeof c?.media_next === "string" ? c.media_next : null,
    backfill_done: Boolean(c?.backfill_done),
    watermark_id: c?.watermark_id ?? null,
    watermark_ts: c?.watermark_ts ?? null,
    pages: Number(c?.pages ?? 0),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    const connection_id = String(body.connection_id ?? "");
    const chain = Number(body._chain ?? 0);
    if (!organization_id || !connection_id) return json({ error: "missing_fields" }, 400);

    // Modo serviço (trigger headless/cron/auto-continuação): x-sync-token dedicado OU
    // bearer == token interno (get_internal_function_auth_token, usado pelo pg_cron); senão JWT+membership.
    const svcToken = req.headers.get("x-sync-token");
    let serviceMode = Boolean(svcToken && svcToken === Deno.env.get("META_SYNC_TRIGGER_TOKEN"));
    if (!serviceMode) {
      const bearer = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
      if (bearer) {
        try {
          const { data: internal } = await admin.rpc("get_internal_function_auth_token");
          if (internal && bearer === internal) serviceMode = true;
        } catch (_) { /* rpc indisponível → segue p/ validação de JWT */ }
      }
    }
    if (!serviceMode) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
      if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
      const { data: user } = await admin.from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
      if (!user) return json({ error: "user_not_found" }, 403);
      const { data: membership } = await admin.from("user_organizations").select("id")
        .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
      if (!membership) return json({ error: "forbidden_org" }, 403);
    }
    const { data: conn } = await admin.from("meta_connections").select("id")
      .eq("id", connection_id).eq("organization_id", organization_id).maybeSingle();
    if (!conn) return json({ error: "connection_not_found" }, 404);

    const { data: assets } = await admin.from("meta_assets")
      .select("id, external_id, asset_type, metadata")
      .eq("connection_id", connection_id).eq("selection_state", "selected")
      .in("asset_type", ["page", "instagram_account"]);
    if (!assets?.length) return json({ success: true, message: "no_selected_organic_assets" });

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    const deadline = Date.now() + TIME_BUDGET_MS;
    const results: any[] = [];
    let anyPending = false; // algum asset ainda não terminou → auto-continua

    for (const asset of assets) {
      // Carrega checkpoint existente do asset.
      const { data: st } = await admin.from("meta_sync_state")
        .select("cursor").eq("asset_id", asset.id).eq("kind", "organic").maybeSingle();
      const cursor = initCursor(st?.cursor);
      const mode: "backfill" | "incremental" = cursor.backfill_done ? "incremental" : "backfill";

      const { data: run } = await admin.from("meta_sync_runs").insert({
        organization_id, connection_id, asset_id: asset.id, kind: "organic", mode,
        sync_version: SYNC_VERSION, parser_version: PARSER_VERSION, source_api_version: GRAPH_API_VERSION, status: "running",
      }).select("id").single();
      await admin.from("meta_sync_state").upsert({
        organization_id, connection_id, asset_id: asset.id, kind: "organic", sync_status: "running",
        cursor: cursor as unknown as Record<string, unknown>,
      }, { onConflict: "asset_id,kind" });

      const stats = { media: 0, insights: 0, insights_failed: 0, pages: 0, refreshed: 0 };
      let assetDone = false;
      try {
        const platform = asset.asset_type === "instagram_account" ? "instagram" : "facebook";
        // Página exige PAGE access token (erro #210 com token de usuário/system-user).
        let mediaToken = accessToken;
        if (platform === "facebook") {
          try {
            const pt = await metaGraphGet(`/${asset.external_id}`, { fields: "access_token" }, { accessToken, appSecret });
            if (pt?.access_token) mediaToken = pt.access_token;
          } catch (_) { /* sem page token -> tenta com o token atual */ }
        }

        const mediaPath = platform === "instagram"
          ? `/${asset.external_id}/media`
          : `/${asset.external_id}/published_posts`;
        const mediaFields = platform === "instagram"
          ? "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url"
          : "id,message,permalink_url,created_time,full_picture";
        const firstPage = () => metaGraphGet(mediaPath, { fields: mediaFields, limit: PAGE_LIMIT }, { accessToken: mediaToken, appSecret });

        // (Re)coleta insights lifetime de UMA mídia já existente. Idempotente. Tolerante.
        // Facebook post: `post_impressions` foi depreciada (15/11/2025) → `post_media_view`.
        // IG: `views` (unificação abr/2025). O insight `likes` == campo-objeto `like_count`
        // (provado na reconciliação) — divergência com a UI da Meta é lag da Meta, não nosso.
        const upsertInsights = async (mediaRowId: string, extId: string, mediaType: string) => {
          try {
            const metric = platform === "instagram"
              ? (mediaType === "reel"
                ? "views,reach,likes,comments,shares,saved"
                : "reach,likes,comments,saved,shares")
              : "post_media_view";
            const ins = await metaGraphGet(`/${extId}/insights`, { metric }, { accessToken: mediaToken, appSecret });
            const rows = ins?.data ?? [];
            await admin.from("meta_media_insights").upsert({
              // end_time sentinela p/ lifetime: NULL quebra o UNIQUE (NULL≠NULL) → duplicaria.
              organization_id, connection_id, media_id: mediaRowId, period: "lifetime", end_time: "1970-01-01",
              reach: pickMetric(rows, ["reach", "post_impressions_unique"]),
              impressions: pickMetric(rows, ["impressions", "post_impressions"]),
              views: pickMetric(rows, ["views", "plays", "post_media_view", "ig_reels_video_view_total_time"]),
              engagement: pickMetric(rows, ["engagement", "post_engaged_users"]),
              likes: pickMetric(rows, ["likes"]),
              comments: pickMetric(rows, ["comments"]),
              shares: pickMetric(rows, ["shares"]),
              saves: pickMetric(rows, ["saved"]),
              raw: rows, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
            }, { onConflict: "media_id,period,end_time" });
            stats.insights++;
          } catch (_) {
            stats.insights_failed++; /* métrica indisponível p/ esse tipo/mídia */
          }
        };

        // Processa (upsert mídia + insights) uma mídia recém-listada. Idempotente.
        const processMedia = async (m: any) => {
          const mediaType = platform === "instagram"
            ? (m.media_product_type === "REELS" ? "reel" : String(m.media_type ?? "post").toLowerCase())
            : "post";
          const { data: mediaRow } = await admin.from("meta_media").upsert({
            organization_id, connection_id, asset_id: asset.id, platform, media_type: mediaType,
            external_id: String(m.id), permalink: m.permalink ?? m.permalink_url ?? null,
            caption: m.caption ?? m.message ?? null, thumbnail_url: m.thumbnail_url ?? m.full_picture ?? null,
            published_at: m.timestamp ?? m.created_time ?? null,
            raw: m, source_api_version: GRAPH_API_VERSION, parser_version: PARSER_VERSION, synced_at: new Date().toISOString(),
          }, { onConflict: "connection_id,external_id" }).select("id").single();
          stats.media++;
          if (!mediaRow) return;
          await upsertInsights(mediaRow.id, String(m.id), mediaType);
        };

        // Persiste o cursor (checkpoint) após cada página concluída — retomável a frio.
        const saveCursor = async () => {
          await admin.from("meta_sync_state").upsert({
            organization_id, connection_id, asset_id: asset.id, kind: "organic",
            sync_status: "running", cursor: cursor as unknown as Record<string, unknown>,
          }, { onConflict: "asset_id,kind" });
        };

        if (mode === "backfill") {
          // Do mais recente ao mais antigo, seguindo TODOS os cursores até acabar.
          while (Date.now() <= deadline && !cursor.backfill_done) {
            const page = await fetchPage(cursor.media_next, firstPage);
            const items: any[] = Array.isArray(page?.data) ? page.data : [];
            // Watermark = mídia mais recente (1º item da 1ª página do backfill).
            if (!cursor.watermark_id && items.length) {
              cursor.watermark_id = String(items[0].id);
              cursor.watermark_ts = items[0].timestamp ?? items[0].created_time ?? null;
            }
            let pageComplete = true;
            for (const m of items) {
              if (Date.now() > deadline) { pageComplete = false; break; }
              await processMedia(m);
            }
            if (!pageComplete) break; // não avança: reprocessa a MESMA página na próxima execução (idempotente)
            cursor.pages++; stats.pages++;
            const next = page?.paging?.next as string | undefined;
            if (!next) { cursor.backfill_done = true; cursor.media_next = null; cursor.phase = "incremental"; }
            else { cursor.media_next = next; }
            await saveCursor();
          }
          assetDone = cursor.backfill_done;
        } else {
          // INCREMENTAL: só o novo desde o watermark. Segue páginas até bater no watermark ou fim.
          let pageUrl: string | null = null;
          let newestId: string | null = null, newestTs: string | null = null;
          let reachedEnd = false, hitWatermark = false, interrupted = false;
          while (Date.now() <= deadline) {
            const page = await fetchPage(pageUrl, firstPage);
            const items: any[] = Array.isArray(page?.data) ? page.data : [];
            if (newestId === null && items.length) {
              newestId = String(items[0].id);
              newestTs = items[0].timestamp ?? items[0].created_time ?? null;
            }
            for (const m of items) {
              if (String(m.id) === cursor.watermark_id) { hitWatermark = true; break; }
              if (Date.now() > deadline) { interrupted = true; break; }
              await processMedia(m);
            }
            if (hitWatermark || interrupted) break;
            const next = page?.paging?.next as string | undefined;
            if (!next) { reachedEnd = true; break; }
            pageUrl = next;
          }
          // Só avança o watermark se completou a varredura (bateu no antigo ou chegou ao fim).
          if ((hitWatermark || reachedEnd) && newestId) {
            cursor.watermark_id = newestId; cursor.watermark_ts = newestTs;
          }
          const newScanDone = hitWatermark || reachedEnd;

          // REFRESH POR TIERS: conteúdo NÃO é imutável — viral cresce por meses. Re-coleta
          // insights das mídias "vencidas", stalest-first, sem rebuscar todo o histórico.
          // Tiers (janela de frescor por perfil de crescimento):
          //   viral (views ≥ 100k): 12h · recente (≤7d): 6h · médio (≤90d): 72h · antigo estável: 720h.
          let refreshExhausted = true;
          if (Date.now() <= deadline) {
            const { data: cand } = await admin
              .from("meta_media_insights")
              .select("media_id, synced_at, views, meta_media!inner(external_id, media_type, published_at, asset_id)")
              .eq("meta_media.asset_id", asset.id)
              .eq("period", "lifetime")
              .order("synced_at", { ascending: true })
              .limit(600);
            const nowMs = Date.now();
            for (const c of cand ?? []) {
              if (Date.now() > deadline) { refreshExhausted = false; break; }
              const mm: any = (c as any).meta_media;
              const ageDays = mm?.published_at ? (nowMs - new Date(mm.published_at).getTime()) / 86400000 : 9999;
              const staleH = (c as any).synced_at ? (nowMs - new Date((c as any).synced_at).getTime()) / 3600000 : 9999;
              const views = Number((c as any).views ?? 0);
              const thr = views >= 100000 ? 12 : ageDays <= 7 ? 6 : ageDays <= 90 ? 72 : 720;
              if (staleH < thr) continue; // ainda fresco p/ o seu tier
              await upsertInsights(String((c as any).media_id), String(mm.external_id), String(mm.media_type));
              stats.refreshed++;
            }
          }

          // Só "idle" quando a varredura do novo terminou E não sobrou refresh vencido no orçamento.
          assetDone = newScanDone && refreshExhausted;
          await saveCursor();
        }

        const finalStatus = assetDone ? "idle" : "running";
        await admin.from("meta_sync_state").upsert({
          organization_id, connection_id, asset_id: asset.id, kind: "organic",
          sync_status: finalStatus, last_synced_at: assetDone ? new Date().toISOString() : undefined,
          counters: { last_run: stats, phase: cursor.phase, backfill_done: cursor.backfill_done, pages_total: cursor.pages },
          cursor: cursor as unknown as Record<string, unknown>,
          error_class: null, error_message: null,
        }, { onConflict: "asset_id,kind" });
        await admin.from("meta_sync_runs").update({
          status: assetDone ? "success" : "partial", completed_at: new Date().toISOString(), stats,
        }).eq("id", run?.id);
        results.push({ asset_id: asset.id, mode, done: assetDone, ...stats, backfill_done: cursor.backfill_done });
        if (!assetDone) anyPending = true;
      } catch (err) {
        const cls = classifyMetaError(err);
        await admin.from("meta_sync_state").upsert({
          organization_id, connection_id, asset_id: asset.id, kind: "organic",
          sync_status: "error", error_class: cls, error_message: (err as Error).message?.slice(0, 300),
          cursor: cursor as unknown as Record<string, unknown>,
        }, { onConflict: "asset_id,kind" });
        await admin.from("meta_sync_runs").update({
          status: "error", completed_at: new Date().toISOString(), error_class: cls,
          error_message: (err as Error).message?.slice(0, 300), stats,
        }).eq("id", run?.id);
        results.push({ asset_id: asset.id, error: cls });
        // Erro transitório/rate-limit: mantém pendente p/ retomar; auth/permanent: não insiste.
        if (cls === "rate_limit" || cls === "transient") anyPending = true;
      }
    }

    // AUTO-CONTINUAÇÃO: se algum asset não terminou (tempo/rate-limit), dispara nova execução
    // headless que retoma do cursor. Termina naturalmente quando backfill_done em todos.
    let continued = false;
    if (anyPending && chain < MAX_CHAIN) {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-organic-sync`;
      const syncTok = Deno.env.get("META_SYNC_TRIGGER_TOKEN") ?? "";
      const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      // fire-and-forget (não aguarda) — a próxima execução continua o backfill.
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anon}`, "x-sync-token": syncTok },
        body: JSON.stringify({ organization_id, connection_id, _chain: chain + 1 }),
      }).catch(() => {});
      continued = true;
    }

    return json({ success: true, chain, continued, pending: anyPending, results });
  } catch (e) {
    console.error("meta-organic-sync error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
