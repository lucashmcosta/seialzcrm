// ============================================================================
// Switch "Responder por" (Comercial) — resolução de PROVIDER no lado cliente.
//
// Espelho mínimo de `supabase/functions/_shared/manual-reply-endpoint.ts`.
// Serve APENAS para o dispatcher saber qual provider function chamar; a
// validação autoritativa continua dentro de meta/twilio/evolution-whatsapp-send
// (defesa em profundidade). Todas as checagens usadas aqui são server-side
// (RPCs SECURITY DEFINER + tabelas sob RLS) — nada é inferido no browser.
//
// Contrato:
//   • campo ausente            → { mode: "auto" }, ZERO queries novas.
//   • flag OFF + campo         → MANUAL_REPLY_FEATURE_DISABLED.
//   • flag ON + campo válido   → { mode: "manual", endpointId, provider }.
//   • qualquer outra condição  → erro tipado (fail-closed, nunca outro número).
// ============================================================================

import { supabase } from "@/integrations/supabase/client";

export const MANUAL_REPLY_FLAG = "sales_manual_reply_endpoint_v1";

export type ManualReplyProvider = "twilio" | "meta_cloud_api" | "evolution_api";

export type ManualReplyErrorCode =
  | "MANUAL_REPLY_FEATURE_DISABLED"
  | "MANUAL_REPLY_ENDPOINT_FORBIDDEN"
  | "MANUAL_REPLY_ENDPOINT_NOT_SALES"
  | "MANUAL_REPLY_THREAD_NOT_SALES"
  | "MANUAL_REPLY_ENDPOINT_INACTIVE"
  | "MANUAL_REPLY_ENDPOINT_CROSS_ORG";

export type ManualReplyResolution =
  | { mode: "auto" }
  | { mode: "manual"; endpointId: string; provider: ManualReplyProvider }
  | { mode: "error"; code: ManualReplyErrorCode; message: string };

function fail(code: ManualReplyErrorCode, message: string): ManualReplyResolution {
  console.warn("[manual-reply] denied (client)", { code, message });
  return { mode: "error", code, message };
}

function normalizeProvider(raw: string | null | undefined): ManualReplyProvider | null {
  if (raw === "meta_cloud_api") return "meta_cloud_api";
  if (raw === "evolution_api") return "evolution_api";
  if (raw === "twilio") return "twilio";
  return null;
}

async function flagEnabledForOrg(organizationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("is_enabled, organization_ids")
    .eq("name", MANUAL_REPLY_FLAG)
    .maybeSingle();
  if (error) return false;
  const row = data as { is_enabled?: boolean | null; organization_ids?: string[] | null } | null;
  if (!row || row.is_enabled !== true) return false;
  const orgs = (row.organization_ids ?? []) as string[];
  return orgs.length === 0 || orgs.includes(organizationId);
}

export async function resolveManualReplyEndpoint(input: {
  organizationId: string;
  threadId?: string | null;
  userId?: string | null;
  manualReplyEndpointId?: string | null;
}): Promise<ManualReplyResolution> {
  const manualId = input.manualReplyEndpointId ?? null;
  // Short-circuit: campo ausente ⇒ nenhuma query, fluxo atual byte-a-byte.
  if (!manualId) return { mode: "auto" };

  if (!(await flagEnabledForOrg(input.organizationId))) {
    return fail(
      "MANUAL_REPLY_FEATURE_DISABLED",
      "A escolha manual de número não está habilitada para esta organização.",
    );
  }

  if (!input.userId) {
    return fail("MANUAL_REPLY_ENDPOINT_FORBIDDEN", "Escolha manual exige usuário identificado.");
  }
  if (!input.threadId) {
    return fail(
      "MANUAL_REPLY_THREAD_NOT_SALES",
      "Escolha manual exige uma conversa Comercial existente.",
    );
  }

  const { data: canonical, error: canonicalErr } = await supabase.rpc(
    "fn_is_canonical_sales_thread",
    { _organization_id: input.organizationId, _thread_id: input.threadId },
  );
  if (canonicalErr || canonical !== true) {
    return fail(
      "MANUAL_REPLY_THREAD_NOT_SALES",
      "Conversa não é Comercial canônica de WhatsApp.",
    );
  }

  const { data: grant, error: grantErr } = await supabase
    .from("user_reply_endpoints")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .eq("endpoint_id", manualId)
    .maybeSingle();
  if (grantErr || !grant) {
    return fail(
      "MANUAL_REPLY_ENDPOINT_FORBIDDEN",
      "Usuário não autorizado a enviar por este número.",
    );
  }

  const { data: eligible, error: eligibleErr } = await supabase.rpc(
    "fn_is_sales_eligible_endpoint",
    { _organization_id: input.organizationId, _endpoint_id: manualId },
  );
  if (eligibleErr || eligible !== true) {
    return fail(
      "MANUAL_REPLY_ENDPOINT_NOT_SALES",
      "Número não pertence à configuração Comercial ativa desta organização.",
    );
  }

  const { data: ep, error: epErr } = await supabase
    .from("communication_endpoints")
    .select("id, organization_id, channel, is_active, provider")
    .eq("id", manualId)
    .maybeSingle();
  if (epErr || !ep) {
    return fail("MANUAL_REPLY_ENDPOINT_FORBIDDEN", "Número não encontrado.");
  }
  if ((ep as any).organization_id !== input.organizationId) {
    return fail("MANUAL_REPLY_ENDPOINT_CROSS_ORG", "Número de outra organização.");
  }
  if ((ep as any).channel !== "whatsapp" || (ep as any).is_active !== true) {
    return fail("MANUAL_REPLY_ENDPOINT_INACTIVE", "Número inativo ou fora do canal WhatsApp.");
  }
  const provider = normalizeProvider((ep as any).provider);
  if (!provider) {
    return fail("MANUAL_REPLY_ENDPOINT_INACTIVE", "Provider do número é desconhecido.");
  }

  return { mode: "manual", endpointId: manualId, provider };
}
