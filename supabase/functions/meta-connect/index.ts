// meta-connect — recebe o `code` do FB.login (Login for Business), valida o intent
// one-time, troca por token, faz introspection (sem heurística), persiste a conexão
// (metadados) + credencial (ciphertext, tabela separada), compat Lead Ads, audit e
// dispara o discovery. verify_jwt=true. Nunca loga token/code.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";
import {
  audit,
  exchangeCodeForToken,
  facebookAppSecret,
  facebookAppId,
  facebookConfigured,
  introspectToken,
} from "../_shared/meta/connection.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const code = String(body.code ?? "");
    const intent_id = String(body.intent_id ?? "");
    if (!organization_id || !code || !intent_id) return json({ error: "missing_fields" }, 400);
    if (!facebookConfigured()) return json({ error: "facebook_not_configured" }, 503);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: user } = await admin
      .from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
    if (!user) return json({ error: "user_not_found" }, 403);

    // Consome o intent de forma atômica e one-time (valida org+user+expiração).
    const { data: consumed } = await admin
      .from("meta_connection_intents")
      .update({ used_at: new Date().toISOString() })
      .eq("id", intent_id)
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id").maybeSingle();
    if (!consumed) return json({ error: "invalid_or_expired_intent" }, 400);

    // Troca do code por token + introspection (evidência oficial, sem heurística).
    let accessToken: string;
    try {
      const exchanged = await exchangeCodeForToken(code);
      accessToken = exchanged.access_token;
    } catch {
      return json({ error: "token_exchange_failed" }, 400);
    }

    let debug;
    try {
      debug = await introspectToken(accessToken);
    } catch {
      return json({ error: "token_introspection_failed" }, 400);
    }

    // Valida o token e captura o usuário autorizador.
    let me: { id?: string; name?: string } = {};
    try {
      me = await metaGraphGet("/me", { fields: "id,name" }, {
        accessToken,
        appSecret: facebookAppSecret(),
      });
    } catch {
      return json({ error: "token_validation_failed" }, 400);
    }

    const enc = await encryptSecret(accessToken);

    // Atomic persistence snapshots working routes before creating a pending authorization.
    const { data: connectionId, error: connErr } = await admin.rpc('rpc_create_meta_oauth_connection', {
      p_org: organization_id, p_user: user.id, p_ciphertext: enc,
      p_meta: {
        authorizing_meta_user_id: me.id ?? debug.meta_user_id ?? null,
        authorizing_meta_user_name: me.name ?? null, granted_scopes: debug.scopes,
        granular_scopes: debug.granular_scopes, token_type: debug.token_type,
        expires_at: debug.expires_at, data_access_expires_at: debug.data_access_expires_at,
        config_id: Deno.env.get('FACEBOOK_CONFIG_ID')?.trim() || null,
        app_id: debug.app_id ?? facebookAppId(),
      },
    });
    if (connErr || !connectionId) throw new Error('connection_persistence_failed');
    const conn = { id: connectionId };

    await audit(admin, {
      organization_id,
      connection_id: conn.id,
      actor_user_id: user.id,
      action: "connect",
      detail: { token_type: debug.token_type, scopes: debug.scopes },
    });

    // Dispara discovery em background.
    const discovery = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-connect-discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ organization_id, connection_id: conn.id }),
    }).then(r => r.ok).catch(() => false);

    return json({
      success: true,
      connection_id: conn.id,
      activation_state: "pending", discovery_complete: discovery,
      token_type: debug.token_type,
      scopes: debug.scopes,
      meta_user: { id: me.id ?? null, name: me.name ?? null },
    });
  } catch (e) {
    console.error("meta-connect error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
