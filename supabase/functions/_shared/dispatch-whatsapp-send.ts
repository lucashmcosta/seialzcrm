// Dispatcher único de envio WhatsApp (lado servidor).
//
// ÚNICO ponto autorizado a invocar `twilio-whatsapp-send` ou `meta-whatsapp-send`.
// Qualquer outro arquivo deve importar `dispatchWhatsAppSend` daqui.
//
// Política fail-closed (igual ao dispatcher cliente):
//   1. Se `endpointId` for passado, a row é obrigatória.
//   2. Se `threadId` for passado e tiver `primary_endpoint_id`, a row é obrigatória.
//   3. Se a thread não tiver `primary_endpoint_id`, tenta a última `messages.endpoint_id`.
//   4. Só então cai no DEFAULT `twilio` (compat. com threads legadas Twilio puras).

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// === Re-rota Comercial → Meta 7020 (Central Trabalhista) ===
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
  dryRun?: boolean;
  endpointId?: string;
  migrationContext?: MigrationContext;
}

export interface WhatsAppSendResult {
  data: any;
  error: { message: string; name?: string; details?: any } | null;
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

async function loadEndpointProvider(
  supabase: SupabaseClient,
  endpointId: string,
): Promise<Provider> {
  const { data, error } = await supabase
    .from("communication_endpoints")
    .select("provider")
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
      `Endpoint ${endpointId} não encontrado.`,
    );
  }
  const provider = (data as any).provider as string | null;
  if (provider === "meta_cloud_api") return "meta_cloud_api";
  if (provider === "twilio" || provider == null) return "twilio";
  throw new DispatchResolveError(
    "unknown_provider",
    `Provider desconhecido para endpoint ${endpointId}: ${provider}`,
  );
}

async function resolveProvider(
  supabase: SupabaseClient,
  payload: WhatsAppSendPayload,
): Promise<{ provider: Provider; source: ResolveSource }> {
  if (payload.endpointId) {
    const provider = await loadEndpointProvider(supabase, payload.endpointId);
    return { provider, source: "endpoint_explicit" };
  }

  if (payload.threadId) {
    const { data: thread, error: tErr } = await supabase
      .from("message_threads")
      .select("primary_endpoint_id, business_context, organization_id, channel")
      .eq("id", payload.threadId)
      .maybeSingle();
    if (tErr) {
      throw new DispatchResolveError(
        "thread_lookup_failed",
        `Falha ao ler thread ${payload.threadId}: ${tErr.message}`,
      );
    }
    const pid = (thread as any)?.primary_endpoint_id as string | null | undefined;
    const orgId = (thread as any)?.organization_id as string | null | undefined;
    const channel = ((thread as any)?.channel as string | null) ?? "whatsapp";
    const bContext = (thread as any)?.business_context as string | null | undefined;

    // Roteamento por LINHA (restaurado). Deriva purpose do primary (se houver)
    // ou do business_context; consulta messaging_lines.active_endpoint_id.
    let refPurpose: string | null = null;
    if (pid) {
      const { data: primEp } = await supabase
        .from("communication_endpoints")
        .select("purpose")
        .eq("id", pid)
        .maybeSingle();
      refPurpose = ((primEp as any)?.purpose as string | null) ?? null;
    }
    if (!refPurpose) {
      refPurpose = bContext === "sales" ? "commercial" : "customer_service";
    }
    const lineKey =
      refPurpose === "commercial" || refPurpose === "vendor_personal" ? "commercial"
      : refPurpose ? "customer_service"
      : null;
    if (orgId && lineKey) {
      const { data: line } = await supabase
        .from("messaging_lines")
        .select("active_endpoint_id")
        .eq("organization_id", orgId)
        .eq("key", lineKey)
        .eq("channel", channel)
        .maybeSingle();
      const activeId = (line as any)?.active_endpoint_id as string | null | undefined;
      if (activeId) {
        const { data: activeEp } = await supabase
          .from("communication_endpoints")
          .select("id, is_active, provider")
          .eq("id", activeId)
          .maybeSingle();
        if (activeEp && (activeEp as any).is_active) {
          payload.endpointId = activeId;
          const providerRaw = (activeEp as any).provider as string | null;
          const provider: Provider = providerRaw === "meta_cloud_api"
            ? "meta_cloud_api"
            : providerRaw === "evolution_api"
              ? ("evolution_api" as any)
              : "twilio";
          console.log("[dispatch-wa] line_routing_resolved (server)", {
            threadId: payload.threadId,
            lineKey,
            primary: pid,
            active: activeId,
            provider,
          });
          return { provider: provider as any, source: "endpoint_explicit" };
        }
      }
    }

    if (pid) {
      const provider = await loadEndpointProvider(supabase, pid);
      return { provider, source: "thread_primary_endpoint" };
    }

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
      const provider = await loadEndpointProvider(supabase, lastEndpointId);
      return { provider, source: "thread_last_message_endpoint" };
    }
  }

  return { provider: "twilio", source: "default" };
}


export async function dispatchWhatsAppSend(
  payload: WhatsAppSendPayload,
  options?: { supabase?: SupabaseClient },
): Promise<WhatsAppSendResult> {
  const supabase = options?.supabase ?? createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let resolved: { provider: Provider; source: ResolveSource };
  try {
    resolved = await resolveProvider(supabase, payload);
  } catch (e) {
    const err = e as DispatchResolveError;
    console.error("[dispatch-wa] resolve failed", {
      code: err.code,
      message: err.message,
      endpointId: payload.endpointId ?? null,
      threadId: payload.threadId ?? null,
    });
    return { data: null, error: { message: err.message, name: err.code } };
  }

  // Re-rota lazy Comercial → Meta 7020 (Central Trabalhista)
  const shouldReroute =
    payload.senderContext === "messages" &&
    payload.organizationId === REROUTE_ORG_ID &&
    (resolved.provider === "twilio" || resolved.source === "default") &&
    payload.endpointId !== REROUTE_TARGET_ENDPOINT_ID &&
    !!payload.threadId;

  if (shouldReroute) {
    console.log("[dispatch-wa] re-route commercial → meta 7020", {
      threadId: payload.threadId,
      previousSource: resolved.source,
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
    resolved = { provider: "meta_cloud_api", source: "endpoint_explicit" };
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { data: null, error: { message: json?.error || `HTTP ${res.status}`, details: json } };
    }
    return { data: json, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } };
  }
}
