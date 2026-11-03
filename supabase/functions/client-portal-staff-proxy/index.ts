// Proxy da tela do Seialz para o portal-staff do App. JWT do usuário obrigatório;
// organização e identidade da equipe vêm da sessão, nunca do navegador.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { signHeaders } from "../_shared/client-portal/hmac.ts";
import { buildStaffBody, isAllowedOp, sanitizeParams, WRITE_OPS } from "./logic.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { code: "method_not_allowed" });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json(401, { code: "unauthorized" });
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: claims, error: cErr } = await userClient.auth.getClaims(auth.slice(7));
  if (cErr || !claims?.claims?.sub) return json(401, { code: "unauthorized" });

  const orgId = Deno.env.get("CLIENT_PORTAL_ORGANIZATION_ID");
  const secret = Deno.env.get("CLIENT_PORTAL_HMAC_SECRET");
  const staffUrl = Deno.env.get("CLIENT_PORTAL_STAFF_URL");
  if (!orgId || !secret || !staffUrl) return json(500, { code: "not_configured" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { code: "invalid_body" }); }
  if (!isAllowedOp(body?.op)) return json(400, { code: "op_not_allowed" });
  const op = body.op;

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: user } = await db.from("users").select("id, full_name, first_name, email")
    .eq("auth_user_id", claims.claims.sub).maybeSingle();
  if (!user) return json(403, { code: "forbidden" });
  const { data: member } = await db.from("user_organizations").select("id")
    .eq("organization_id", orgId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (!member) return json(403, { code: "forbidden" });
  const { data: perms } = await db.rpc("perms_v2_for_user", { _org: orgId, _user: user.id });
  const at = (perms as any)?.dados?.atendimentos ?? {};
  if ((at.ver ?? "nenhum") === "nenhum") return json(403, { code: "forbidden" });
  if (WRITE_OPS.has(op) && (at.editar ?? "nenhum") === "nenhum") return json(403, { code: "forbidden" });

  const staff = { userId: user.id, displayName: user.full_name || user.first_name || user.email || "Equipe" };
  const params = sanitizeParams(op, body.params, staff);
  if (!params) return json(400, { code: "invalid_params" });

  const raw = buildStaffBody(orgId, staff, op, params);
  let upstream: Response;
  try {
    upstream = await fetch(staffUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await signHeaders(secret, raw, Math.floor(Date.now() / 1000))) },
      body: raw,
    });
  } catch {
    return json(502, { code: "portal_unreachable" });
  }
  const text = await upstream.text();
  let out: unknown;
  try { out = JSON.parse(text); } catch { out = { code: "portal_invalid_response" }; }

  if (upstream.ok && op === "conversation.assign") {
    await db.from("client_portal_chat_events")
      .update({ assigned_user_id: (params.assignee as { userId: string } | null)?.userId ?? null })
      .eq("conversation_id", params.conversationId as string).eq("organization_id", orgId);
  }
  if (upstream.ok && op === "conversation.read") {
    await db.from("client_portal_chat_events").update({ unread_for_staff: 0 })
      .eq("conversation_id", params.conversationId as string).eq("organization_id", orgId);
  }
  return json(upstream.ok ? 200 : upstream.status, out);
});
