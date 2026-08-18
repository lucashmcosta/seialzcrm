// ============================================================================
// Switch "Responder por" (Comercial) — validador ÚNICO server-side.
//
// Contrato:
//  - Flag `sales_manual_reply_endpoint_v1` é barreira server-side.
//      • campo ausente                → { mode: "auto" } (fluxo atual intacto)
//      • flag OFF + campo presente    → MANUAL_REPLY_FEATURE_DISABLED
//  - O override manual substitui SOMENTE "qual endpoint usar". Nenhuma outra
//    regra do pipeline (janela 24h, template, provider, rate limit,
//    integração) é dispensada — quem chama continua executando tudo.
//  - Fail-closed: qualquer condição não satisfeita retorna erro tipado.
//    NUNCA cair para outro endpoint.
//  - Proibido usar primary_endpoint_id, purpose, assignee, owner ou
//    display_name para inferir permissão.
// ============================================================================

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { featureFlagEnabled } from "./feature-flags.ts";
import { canUserUseReplyEndpoint } from "./reply-endpoint-selection.ts";

export const MANUAL_REPLY_FLAG = "sales_manual_reply_endpoint_v1";

export type ManualReplyErrorCode =
  | "MANUAL_REPLY_FEATURE_DISABLED"
  | "MANUAL_REPLY_ENDPOINT_FORBIDDEN"
  | "MANUAL_REPLY_ENDPOINT_NOT_SALES"
  | "MANUAL_REPLY_THREAD_NOT_SALES"
  | "MANUAL_REPLY_ENDPOINT_INACTIVE"
  | "MANUAL_REPLY_ENDPOINT_OFFLINE"
  | "MANUAL_REPLY_ENDPOINT_IDENTITY_UNKNOWN"
  | "MANUAL_REPLY_ENDPOINT_IDENTITY_MISMATCH"
  | "MANUAL_REPLY_ENDPOINT_CROSS_ORG"
  | "REPLY_ENDPOINT_PERSONAL_FORBIDDEN";

export type ManualReplyProvider = "twilio" | "meta_cloud_api" | "evolution_api";

export interface ManualReplyInput {
  organizationId: string;
  threadId?: string | null;
  userId?: string | null;
  manualReplyEndpointId?: string | null;
}

export type ManualReplyResolution =
  | { mode: "auto" }
  | {
      mode: "manual";
      endpointId: string;
      provider: ManualReplyProvider;
      chosenByUserId: string;
    }
  | { mode: "error"; code: ManualReplyErrorCode; message: string };

function fail(code: ManualReplyErrorCode, message: string): ManualReplyResolution {
  console.error("[manual-reply] denied", { code, message });
  return { mode: "error", code, message };
}

function digits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function normalizeProvider(raw: string | null | undefined): ManualReplyProvider | null {
  if (raw === "meta_cloud_api") return "meta_cloud_api";
  if (raw === "evolution_api") return "evolution_api";
  if (raw === "twilio") return "twilio";
  return null;
}

/**
 * Valida (ou recusa) a escolha manual de endpoint de resposta.
 * Retorna `{ mode: "auto" }` quando não há escolha manual — nesse caso o
 * chamador deve seguir exatamente o caminho atual, sem nenhuma diferença.
 */
export async function resolveManualReplyEndpoint(
  supabase: SupabaseClient,
  input: ManualReplyInput,
): Promise<ManualReplyResolution> {
  const manualId = input.manualReplyEndpointId ?? null;
  if (!manualId) return { mode: "auto" };

  const flagOn = await featureFlagEnabled(supabase, MANUAL_REPLY_FLAG, input.organizationId ?? null);
  if (!flagOn) {
    return fail(
      "MANUAL_REPLY_FEATURE_DISABLED",
      "A escolha manual de número não está habilitada para esta organização.",
    );
  }

  if (!input.organizationId) {
    return fail("MANUAL_REPLY_ENDPOINT_FORBIDDEN", "Organização ausente na requisição.");
  }
  if (!input.userId) {
    return fail(
      "MANUAL_REPLY_ENDPOINT_FORBIDDEN",
      "Escolha manual exige usuário identificado.",
    );
  }
  if (!input.threadId) {
    return fail(
      "MANUAL_REPLY_THREAD_NOT_SALES",
      "Escolha manual exige uma conversa Comercial existente.",
    );
  }

  // 1. Thread precisa ser Comercial canônica de WhatsApp da própria org.
  const { data: canonical, error: canonicalErr } = await supabase.rpc(
    "fn_is_canonical_sales_thread",
    { _organization_id: input.organizationId, _thread_id: input.threadId },
  );
  if (canonicalErr || canonical !== true) {
    return fail(
      "MANUAL_REPLY_THREAD_NOT_SALES",
      `Conversa ${input.threadId} não é Comercial canônica de WhatsApp.`,
    );
  }

  // 2. Sem gate por grants (`user_reply_endpoints`): o seletor "Responder por"
  //    vale para TODO usuário com acesso ao Comercial. A autorização é a
  //    elegibilidade Comercial do número na própria organização (passo 3).


  // 3. Elegibilidade Comercial (link ativo em linha whatsapp/sales ativa).
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

  // 3.1 Permissão do usuário sobre ESTE endpoint (Fase 2 — números pessoais).
  //     Comercial: liberado a todo usuário da org. `vendor_personal`: somente
  //     `communication_endpoints.assigned_user_id`. Sem grants, fail-closed.
  const allowed = await canUserUseReplyEndpoint(supabase, {
    organizationId: input.organizationId,
    userId: input.userId,
    endpointId: manualId,
  });
  if (!allowed) {
    return fail(
      "REPLY_ENDPOINT_PERSONAL_FORBIDDEN",
      "Este número é pessoal de outro usuário. Escolha um número permitido para responder.",
    );
  }



  // 4. Endpoint em si: org, canal, atividade, provider conhecido.
  const { data: ep, error: epErr } = await supabase
    .from("communication_endpoints")
    .select("id, organization_id, channel, is_active, provider, external_address")
    .eq("id", manualId)
    .maybeSingle();
  if (epErr || !ep) {
    return fail(
      "MANUAL_REPLY_ENDPOINT_FORBIDDEN",
      `Endpoint ${manualId} não encontrado.`,
    );
  }
  if ((ep as any).organization_id !== input.organizationId) {
    return fail("MANUAL_REPLY_ENDPOINT_CROSS_ORG", "Endpoint de outra organização.");
  }
  if ((ep as any).channel !== "whatsapp" || (ep as any).is_active !== true) {
    return fail("MANUAL_REPLY_ENDPOINT_INACTIVE", "Número inativo ou fora do canal WhatsApp.");
  }
  const provider = normalizeProvider((ep as any).provider);
  if (!provider) {
    return fail("MANUAL_REPLY_ENDPOINT_INACTIVE", "Provider do número é desconhecido.");
  }

  // 5. Evolution: sessão conectada + identidade confirmada.
  if (provider === "evolution_api") {
    const { data: inst, error: instErr } = await supabase
      .from("evolution_instances")
      .select("instance_name, last_known_state, owner_number_digits")
      .eq("organization_id", input.organizationId)
      .eq("endpoint_id", manualId)
      .maybeSingle();
    if (instErr || !inst) {
      return fail(
        "MANUAL_REPLY_ENDPOINT_OFFLINE",
        "Número Evolution sem instância vinculada.",
      );
    }
    if ((inst as any).last_known_state !== "open") {
      return fail(
        "MANUAL_REPLY_ENDPOINT_OFFLINE",
        `Instância ${(inst as any).instance_name} não está conectada.`,
      );
    }
    const owner = digits((inst as any).owner_number_digits);
    if (!owner) {
      return fail(
        "MANUAL_REPLY_ENDPOINT_IDENTITY_UNKNOWN",
        "Identidade do número Evolution não confirmada.",
      );
    }
    const expected = digits((ep as any).external_address);
    if (expected && owner !== expected) {
      return fail(
        "MANUAL_REPLY_ENDPOINT_IDENTITY_MISMATCH",
        "O número conectado difere do número configurado.",
      );
    }
  }

  console.log("[manual-reply] accepted", {
    threadId: input.threadId,
    endpointId: manualId,
    provider,
    userId: input.userId,
  });

  return { mode: "manual", endpointId: manualId, provider, chosenByUserId: input.userId };
}

/**
 * Metadata de auditoria (item 10 do contrato). Nada sensível.
 * `derivedChoice` distingue a seleção automática:
 *   • "derived"       → endpoint da última mensagem válida da thread
 *   • "route_default" → fallback legado `messaging_lines.active_endpoint_id`
 */
export function replyChoiceMetadata(
  resolution: ManualReplyResolution,
  derivedChoice: "derived" | "route_default" = "derived",
) {
  if (resolution.mode === "manual") {
    return {
      reply_endpoint_choice: "manual" as const,
      manual_reply_endpoint_id: resolution.endpointId,
      chosen_by_user_id: resolution.chosenByUserId,
    };
  }
  return { reply_endpoint_choice: derivedChoice };
}

