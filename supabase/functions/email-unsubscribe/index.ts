// Descadastro de e-mail de marketing. Link do rodapé (GET: registra e leva para a página de confirmação)
// e "um clique" do Gmail/Yahoo (POST, cabeçalho List-Unsubscribe-Post). O token é do próprio e-mail;
// revoga o aceite de marketing por e-mail do contato.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = (Deno.env.get("PUBLIC_APP_BASE_URL") || "https://seialz.com").replace(/\/$/, "");
const go = (status: "ok" | "invalid" | "error") =>
  new Response(null, { status: 302, headers: { Location: `${BASE}/descadastro-email?status=${status}` } });

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return new Response(null, { status: 405 });
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{32,128}$/.test(token)) return req.method === "POST" ? new Response(null, { status: 404 }) : go("invalid");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await supabase.rpc("fn_email_unsubscribe", { p_token: token });
  if (error) {
    console.error("[email-unsubscribe]", error.message);
    return req.method === "POST" ? new Response(null, { status: 500 }) : go("error");
  }
  const ok = !!(data as { ok?: boolean } | null)?.ok;
  if (req.method === "POST") return new Response(null, { status: ok ? 200 : 404 });
  return go(ok ? "ok" : "invalid");
});
