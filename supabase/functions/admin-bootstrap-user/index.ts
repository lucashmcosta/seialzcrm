// TEMPORÁRIO: operação one-off administrativa (reset de senha).
// Auth própria em código via header x-bootstrap-token (BOOTSTRAP_USER_TOKEN).
// Remover após uso.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bootstrap-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("BOOTSTRAP_USER_TOKEN");
  if (!expected || req.headers.get("x-bootstrap-token") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { email, password } = await req.json();
    if (!email || !password) return json({ error: "missing_fields" }, 400);

    const { data: row, error: rowErr } = await admin
      .from("users")
      .select("auth_user_id")
      .eq("email", email)
      .maybeSingle();
    if (rowErr) return json({ error: rowErr.message }, 500);
    if (!row?.auth_user_id) return json({ error: "user_not_found" }, 404);

    const { error: updErr } = await admin.auth.admin.updateUserById(row.auth_user_id, { password });
    if (updErr) return json({ error: updErr.message }, 400);

    return json({ success: true, auth_user_id: row.auth_user_id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
