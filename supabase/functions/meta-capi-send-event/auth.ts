// Autorização do meta-capi-send-event (verify_jwt=false → auth própria).
// Chamadores legítimos (mapeados no PR):
//   - fn_capi_dispatch_event (triggers Lead/Purchase via pg_net) → token interno (Vault)
//   - meta-capi-retry-cron / backfill → SUPABASE_SERVICE_ROLE_KEY
//   - MetaCapiDialog (botão "testar" / "reprocessar") → JWT do usuário
// Usuário só pode enviar/reprocessar eventos da org em que é membro ATIVO. No
// reprocessamento a org vem da linha do capi_event_log (é ela que o handler usa).
import { authorizeOrgRequest, type OrgRequestDecision } from "../_shared/auth/membership.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type SendEventDecision =
  | OrgRequestDecision
  | { ok: false; status: 404; error: string };

export async function authorizeSendEvent(
  req: Request,
  admin: AdminClient,
  body: { organization_id?: string | null; capi_event_log_id?: string | null } | null | undefined,
): Promise<SendEventDecision> {
  const first = await authorizeOrgRequest(req, admin, null); // só valida o token (401)
  if (!first.ok || first.caller.kind !== "user") return first;

  let orgId = body?.organization_id ?? null;
  if (body?.capi_event_log_id) {
    const { data, error } = await admin
      .from("capi_event_log")
      .select("organization_id")
      .eq("id", body.capi_event_log_id)
      .maybeSingle();
    if (error) return { ok: false, status: 403, error: "forbidden_org" }; // fail-closed
    if (!data) return { ok: false, status: 404, error: "Log não encontrado" };
    orgId = data.organization_id;
  }
  if (!orgId) return first; // handler devolve 400 (organization_id obrigatório)
  return await authorizeOrgRequest(req, admin, orgId);
}
