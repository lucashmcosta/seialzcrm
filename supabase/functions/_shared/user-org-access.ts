// Quem chama precisa enxergar a oportunidade (mesmas permissões/RLS do app). Devolve os dados mínimos dela.
import { createClient } from "jsr:@supabase/supabase-js@2";

export async function opportunityForCaller(req: Request, orgId: string, opportunityId: string) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false as const, status: 401, error: "missing_bearer_token" };
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: auth } },
  });
  const { data: opp, error } = await user.from("opportunities").select("id, organization_id, contact_id, owner_user_id, status")
    .eq("id", opportunityId).eq("organization_id", orgId).is("deleted_at", null).maybeSingle();
  if (error || !opp) return { ok: false as const, status: 404, error: "opportunity_not_found" };
  const { data: me } = await user.rpc("current_user_id");
  return { ok: true as const, opp, userId: (me as string | null) ?? null };
}
