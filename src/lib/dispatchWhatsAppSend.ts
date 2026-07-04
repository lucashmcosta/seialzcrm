// Dispatcher único de envio WhatsApp (lado cliente).
//
// ÚNICO ponto autorizado a invocar `twilio-whatsapp-send` ou `meta-whatsapp-send`.
// Qualquer outro componente deve importar `dispatchWhatsAppSend` daqui.
// Há regra ESLint (eslint.config.js) que bloqueia invokes diretos fora deste arquivo.
//
// Política fail-closed: se um `endpointId`/`threadId.primary_endpoint_id` foi
// passado mas a row do endpoint não puder ser lida, o envio é abortado em vez
// de cair silenciosamente para Twilio.

import { supabase } from "@/integrations/supabase/client";
import { isSalesPurpose } from "./endpointPurpose";
import { assertTemplateAllowedForEndpoint } from "./complianceGuards";

// === Re-rota Comercial → Meta 7020 (Central Trabalhista) ===
// Lazy: somente quando a tela /messages enviar em thread cujo provider
// resolvido seja Twilio (ou sem endpoint algum). Não toca /inbox.
const REROUTE_ORG_ID = "40ae935c-a7f7-4ad7-8ea4-91be6404a95f";
const REROUTE_TARGET_ENDPOINT_ID = "407ff93d-4860-49cd-82ae-beda456c1774";
const REROUTE_MIGRATION_KIND = "commercial_twilio_to_meta_7020";
const REROUTE_NOTE_KIND = "endpoint_migration_meta_7020";
const REROUTE_NOTE_TEXT =
  "Conversa migrada para o novo número WhatsApp 7020 (Meta Cloud). Histórico anterior preservado.";

export interface MigrationContext {
  kind: string;
  previousProvider: "twilio";
  targetEndpointId: string;
  noteKind: string;
  noteText: string;
}

export interface WhatsAppSendPayload {
  organizationId: string;
  contactId?: string;
  threadId?: string;
  message?: string;
  templateId?: string;
  templateVariables?: Record<string, string | number>;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaType?: string;
  userId?: string;
  replyToMessageId?: string;
  isAgentMessage?: boolean;
  agentId?: string;
  senderName?: string;
  senderContext?: "inbox" | "messages" | string;
  /**
   * message_threads.business_context da thread — usado para decidir a re-rota
   * "Comercial → endpoint comercial" de forma genérica (sem hardcode de org).
   * Opcional: quando ausente, cai na regra legada (senderContext + org).
   */
  businessContext?: "sales" | "customer_service" | "other" | null;
  dryRun?: boolean;
  endpointId?: string;
  migrationContext?: MigrationContext;
}

type Provider = "twilio" | "meta_cloud_api";
type ResolveSource =
  | "endpoint_explicit"
  | "thread_primary_endpoint"
  | "thread_last_message_endpoint"
  | "default";

class DispatchResolveError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

interface EndpointInfo {
  provider: Provider;
  purpose: string | null;
}

async function loadEndpointInfo(endpointId: string): Promise<EndpointInfo> {
  const { data, error } = await supabase
    .from("communication_endpoints")
    .select("provider, purpose")
    .eq("id", endpointId)
    .maybeSingle();
  if (error) {
    throw new DispatchResolveError(
      "endpoint_lookup_failed",
      `Falha ao ler endpoint ${endpointId}: ${error.message}`,
    );
  }
  if (!data) {
    throw new DispatchResolveError(
      "unknown_endpoint",
      `Endpoint ${endpointId} não encontrado ou sem permissão de leitura.`,
    );
  }
  const providerRaw = (data as any).provider as string | null;
  const purpose = ((data as any).purpose as string | null) ?? null;
  let provider: Provider;
  if (providerRaw === "meta_cloud_api") provider = "meta_cloud_api";
  else if (providerRaw === "twilio" || providerRaw == null) provider = "twilio";
  else {
    throw new DispatchResolveError(
      "unknown_provider",
      `Provider desconhecido para endpoint ${endpointId}: ${providerRaw}`,
    );
  }
  return { provider, purpose };
}

async function resolveProvider(
  payload: WhatsAppSendPayload,
): Promise<{ provider: Provider; purpose: string | null; source: ResolveSource }> {
  // 1. endpointId explícito → obrigatório existir
  if (payload.endpointId) {
    const info = await loadEndpointInfo(payload.endpointId);
    return { ...info, source: "endpoint_explicit" };
  }

  // 2. threadId → primary_endpoint_id → provider
  if (payload.threadId) {
    const { data: thread, error: tErr } = await supabase
      .from("message_threads")
      .select("primary_endpoint_id")
      .eq("id", payload.threadId)
      .maybeSingle();
    if (tErr) {
      throw new DispatchResolveError(
        "thread_lookup_failed",
        `Falha ao ler thread ${payload.threadId}: ${tErr.message}`,
      );
    }
    const pid = (thread as any)?.primary_endpoint_id as string | null | undefined;
    if (pid) {
      const info = await loadEndpointInfo(pid);
      return { ...info, source: "thread_primary_endpoint" };
    }

    // 2b. Fallback: última mensagem da thread com endpoint_id
    const { data: lastMsg } = await supabase
      .from("messages")
      .select("endpoint_id")
      .eq("thread_id", payload.threadId)
      .not("endpoint_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastEndpointId = (lastMsg as any)?.endpoint_id as string | null | undefined;
    if (lastEndpointId) {
      const info = await loadEndpointInfo(lastEndpointId);
      return { ...info, source: "thread_last_message_endpoint" };
    }
  }

  // 3. Default: legado Twilio, purpose desconhecido
  return { provider: "twilio", purpose: null, source: "default" };
}

/**
 * Envia mensagem WhatsApp pelo provider correto (Twilio ou Meta Cloud).
 * Retorna o mesmo shape de `supabase.functions.invoke(...)`: `{ data, error }`.
 */
export async function dispatchWhatsAppSend(payload: WhatsAppSendPayload) {
  let resolved: { provider: Provider; purpose: string | null; source: ResolveSource };
  try {
    resolved = await resolveProvider(payload);
  } catch (e) {
    const err = e as DispatchResolveError;
    console.error("[dispatch-wa] resolve failed", {
      code: err.code,
      message: err.message,
      endpointId: payload.endpointId ?? null,
      threadId: payload.threadId ?? null,
    });
    return { data: null, error: { message: err.message, name: err.code } as any };
  }

  // Re-rota lazy Comercial → endpoint comercial atual.
  //
  // Duas ramas:
  //   (a) PR4 — genérica: thread.business_context = 'sales' e o endpoint
  //       resolvido NÃO é comercial (purpose ∉ SALES_PURPOSES).
  //   (b) Legado — hardcode Central Trabalhista (`REROUTE_ORG_ID`) mantido
  //       como salvaguarda enquanto o front não passa `businessContext` em
  //       todos os pontos de envio. Será removido no PR5.
  //
  // Ambas as ramas só valem em `senderContext === 'messages'` e nunca em
  // `/inbox`.
  let alreadyMigratedThread = false;
  if (
    payload.senderContext === "messages" &&
    payload.organizationId === REROUTE_ORG_ID &&
    payload.threadId &&
    payload.endpointId !== REROUTE_TARGET_ENDPOINT_ID &&
    resolved.provider !== "meta_cloud_api"
  ) {
    const { data: noteRow } = await supabase
      .from("messages")
      .select("id")
      .eq("thread_id", payload.threadId)
      .eq("direction", "internal")
      .contains("metadata", { kind: REROUTE_NOTE_KIND })
      .limit(1)
      .maybeSingle();
    alreadyMigratedThread = !!noteRow;
  }

  const salesContextMismatch =
    payload.senderContext === "messages" &&
    payload.businessContext === "sales" &&
    !isSalesPurpose(resolved.purpose);

  const legacyCentralTrabalhista =
    payload.senderContext === "messages" &&
    payload.organizationId === REROUTE_ORG_ID &&
    (resolved.provider === "twilio" || resolved.source === "default" || alreadyMigratedThread);

  const shouldReroute =
    !!payload.threadId &&
    payload.endpointId !== REROUTE_TARGET_ENDPOINT_ID &&
    (salesContextMismatch || legacyCentralTrabalhista);

  if (shouldReroute) {
    const reason = salesContextMismatch
      ? "sales_context_non_commercial_endpoint"
      : alreadyMigratedThread
        ? "thread_already_migrated"
        : "provider_twilio_or_default";
    console.log("[dispatch-wa] re-route commercial → meta 7020", {
      threadId: payload.threadId,
      previousSource: resolved.source,
      previousPurpose: resolved.purpose,
      businessContext: payload.businessContext ?? null,
      reason,
    });
    payload = {
      ...payload,
      endpointId: REROUTE_TARGET_ENDPOINT_ID,
      migrationContext: {
        kind: REROUTE_MIGRATION_KIND,
        previousProvider: "twilio",
        targetEndpointId: REROUTE_TARGET_ENDPOINT_ID,
        noteKind: REROUTE_NOTE_KIND,
        noteText: REROUTE_NOTE_TEXT,
      },
    };
    resolved = { provider: "meta_cloud_api", purpose: "commercial", source: "endpoint_explicit" };
  }

  const fnName = resolved.provider === "meta_cloud_api"
    ? "meta-whatsapp-send"
    : "twilio-whatsapp-send";

  console.log("[dispatch-wa] route", {
    provider: resolved.provider,
    source: resolved.source,
    fn: fnName,
    endpointId: payload.endpointId ?? null,
    threadId: payload.threadId ?? null,
  });

  // eslint-disable-next-line no-restricted-syntax
  return await supabase.functions.invoke(fnName, { body: payload });
}
