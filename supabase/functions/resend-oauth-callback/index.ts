// Volta da tela de autorização da Resend ("Conectar com Resend"). Confere o state (10 min, uso único),
// troca o código pelo acesso com o verificador PKCE, guarda criptografado, cria o aviso de retorno e
// leva o usuário de volta para Integrações → E-mail.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { finishResendConnect, RESEND_OAUTH_CLIENT_ID, RESEND_OAUTH_REDIRECT, storeOAuthTokens, teardownResend, tokenRequest } from "../_shared/resend-auth.ts";

const BASE = (Deno.env.get("PUBLIC_APP_BASE_URL") || "https://seialz.com").replace(/\/$/, "");
const back = (result: string) =>
  new Response(null, { status: 302, headers: { Location: `${BASE}/settings/integrations/email?resend=${result}` } });

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response(null, { status: 405 });
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (url.searchParams.get("error")) return back("denied");
  if (!/^[0-9a-f]{64}$/.test(state) || !code) return back("invalid");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Uso único: apaga ao ler.
  const { data: rows } = await admin.from("email_oauth_states").delete().eq("state", state)
    .select("organization_id, user_id, code_verifier, expires_at");
  const st = rows?.[0];
  if (!st || new Date(st.expires_at).getTime() < Date.now()) return back("expired");

  const r = await tokenRequest({
    grant_type: "authorization_code", code, redirect_uri: RESEND_OAUTH_REDIRECT,
    code_verifier: st.code_verifier, client_id: RESEND_OAUTH_CLIENT_ID,
  });
  if (!r.ok || !r.data.access_token || !r.data.refresh_token) {
    console.error("[resend-oauth-callback] token", r.status, r.data?.error);
    return back("error");
  }
  await teardownResend(admin, st.organization_id); // conexão anterior (outra conta ou chave)
  const { error } = await storeOAuthTokens(admin, st.organization_id, r.data);
  if (error) { console.error("[resend-oauth-callback] store", error.message); return back("error"); }
  await finishResendConnect(admin, st.organization_id, String(r.data.access_token), "oauth", null, st.user_id ?? null);
  return back("connected");
});
