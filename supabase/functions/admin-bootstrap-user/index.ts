// TEMPORÁRIO: criação one-off de usuário em organização existente.
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
    const { email, password, full_name, organization_id, permission_profile_id } = await req.json();
    if (!email || !password || !full_name || !organization_id || !permission_profile_id) {
      return json({ error: "missing_fields" }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "create_failed" }, 400);

    const authUserId = created.user.id;
    const parts = String(full_name).trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

    let userId: string | null = null;
    const { data: existing } = await admin.from("users").select("id").eq("auth_user_id", authUserId).maybeSingle();

    if (existing) {
      userId = existing.id;
      await admin.from("users").update({ full_name, first_name: firstName, last_name: lastName }).eq("id", userId);

      // limpa organização auto-criada pelo trigger, se houver
      const { data: autoMemberships } = await admin
        .from("user_organizations")
        .select("id, organization_id")
        .eq("user_id", userId);
      for (const m of autoMemberships ?? []) {
        if (m.organization_id === organization_id) continue;
        const autoOrgId = m.organization_id;
        const { data: subs } = await admin.from("subscriptions").select("id").eq("organization_id", autoOrgId);
        for (const s of subs ?? []) {
          await admin.from("subscription_usage").delete().eq("subscription_id", s.id);
        }
        await admin.from("subscriptions").delete().eq("organization_id", autoOrgId);
        await admin.from("pipeline_stages").delete().eq("organization_id", autoOrgId);
        await admin.from("permission_profiles").delete().eq("organization_id", autoOrgId);
        await admin.from("user_organizations").delete().eq("organization_id", autoOrgId);
        await admin.from("organizations").delete().eq("id", autoOrgId);
      }
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("users")
        .insert({ auth_user_id: authUserId, email, full_name, first_name: firstName, last_name: lastName })
        .select("id")
        .single();
      if (insErr || !inserted) {
        await admin.auth.admin.deleteUser(authUserId);
        return json({ error: insErr?.message ?? "user_row_failed" }, 500);
      }
      userId = inserted.id;
    }

    const { error: memErr } = await admin.from("user_organizations").insert({
      user_id: userId,
      organization_id,
      permission_profile_id,
      is_active: true,
    });
    if (memErr) return json({ error: memErr.message, user_id: userId }, 500);

    return json({ success: true, user_id: userId, auth_user_id: authUserId });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
