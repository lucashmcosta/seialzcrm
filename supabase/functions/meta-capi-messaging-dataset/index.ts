// meta-capi-messaging-dataset — pixel (dataset) ligado à conta de WhatsApp da org, para o formato de mensagens.
// A Meta recusa evento de mensagens num pixel sem WABA ligado ("No WhatsApp Business Account Linked to This Dataset")
// e a tela não liga WABA a pixel existente: o caminho é GET/POST /{waba_id}/dataset, que devolve o pixel do WABA
// (ou cria um com create=true). O id vai para connected_account.messaging_dataset_id da integração meta-capi;
// só o envio no formato de mensagens usa esse id (o formato atual segue no pixel_id).
// Só backend (service role ou token interno): cria ativo na Meta, não é ação de usuário.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeOrgRequest } from "../_shared/auth/membership.ts";
import { resolveMetaCredentials } from "../_shared/meta-whatsapp/credentials.ts";

const META_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "v25.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** GET devolve { data: [{ id, name }] } (ou { id }); POST devolve { id }. */
// deno-lint-ignore no-explicit-any
export function datasetId(raw: any): string | null {
  const id = raw?.data?.[0]?.id ?? raw?.id;
  return typeof id === "string" && /^\d+$/.test(id) ? id : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const organizationId = body?.organization_id ? String(body.organization_id) : "";
    if (!organizationId) return json({ error: "missing_fields" }, 400);

    const authz = await authorizeOrgRequest(req, admin, organizationId);
    if (!authz.ok) return json({ error: authz.error }, authz.status);
    if (authz.caller.kind === "user") return json({ error: "backend_only" }, 403);

    const { data: whatsapp } = await admin.from("organization_integrations")
      .select("id, admin_integrations!inner(slug)")
      .eq("organization_id", organizationId).eq("is_enabled", true)
      .eq("admin_integrations.slug", "meta-whatsapp-cloud");
    if (!whatsapp || whatsapp.length !== 1) return json({ error: "whatsapp_not_single", count: whatsapp?.length ?? 0 }, 409);
    const cred = await resolveMetaCredentials(admin, whatsapp[0].id);
    if (!cred.wabaId) return json({ error: "missing_waba" }, 409);

    const graph = async (method: "GET" | "POST") => {
      const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${cred.wabaId}/dataset`, {
        method, headers: { Authorization: `Bearer ${cred.accessToken}` },
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok || dados?.error) {
        const e = dados?.error ?? {};
        throw Object.assign(new Error("graph_error"), { meta: { method, code: e.code, subcode: e.error_subcode, message: e.message } });
      }
      return dados;
    };

    let id = datasetId(await graph("GET"));
    let criado = false;
    if (!id && body?.create === true) {
      id = datasetId(await graph("POST"));
      criado = !!id;
    }
    if (!id) return json({ dataset_id: null, waba_id: cred.wabaId, created: false });

    const { data: capi } = await admin.from("organization_integrations")
      .select("id, connected_account, admin_integrations!inner(slug)")
      .eq("organization_id", organizationId).eq("admin_integrations.slug", "meta-capi").maybeSingle();
    if (!capi) return json({ error: "capi_not_connected", dataset_id: id }, 409);
    const { error } = await admin.from("organization_integrations")
      .update({ connected_account: { ...(capi.connected_account ?? {}), messaging_dataset_id: id } }).eq("id", capi.id);
    if (error) throw new Error(`save_failed:${error.code}`);

    console.log(`[capi-messaging-dataset] org=${organizationId} waba=${cred.wabaId} dataset=${id} created=${criado}`);
    return json({ dataset_id: id, waba_id: cred.wabaId, created: criado });
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const meta = (e as any)?.meta ?? null;
    console.error("[capi-messaging-dataset] falhou", (e as Error).message, meta);
    return json({ error: (e as Error).message, meta }, 502);
  }
});
