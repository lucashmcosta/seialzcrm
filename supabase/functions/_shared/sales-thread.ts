// ============================================================
// _shared/sales-thread.ts
//
// Resolução CANÔNICA da conversa Comercial (WhatsApp).
//
// Contrato (aprovado — Opção 1, etapa A):
//   identidade da conversa = organization_id + contact_id
//                            + channel='whatsapp'
//                            + business_context='sales'
//                            + merged_into_thread_id IS NULL
//
//   • primary_endpoint_id NÃO faz parte da identidade. Ele é o
//     "endpoint de resposta corrente" (dispatch-whatsapp-send lê esse campo
//     para decidir por onde responder) e é rotacionado com log explícito
//     quando o inbound chega por outro número.
//   • thread resolvida/fechada recebendo inbound → reabre a MESMA thread.
//   • losers consolidados (merged_into_thread_id IS NOT NULL) nunca recebem
//     mensagem nova.
//   • Atendimento (purpose != sales/commercial) NÃO passa por aqui — segue
//     integralmente o caminho legado de cada webhook.
//
// Nenhuma trigger/DDL é assumida por este helper: ele é seguro com ou sem a
// guarda de duplicidade no banco.
// ============================================================

type Db = {
  from: (table: string) => any;
};

// Exceção datada herdada de fn_message_threads_autofill_business_context.
const LEGACY_SPLIT_ENDPOINT_ID = "c09bd713-0225-4533-afe8-20ac07bd3a7c";
const LEGACY_SPLIT_AT = Date.parse("2026-06-16T22:29:40Z");

export type SalesThreadOutcome = "reused" | "reopened" | "created";

export type SalesThreadResult = {
  threadId: string | null;
  outcome: SalesThreadOutcome | null;
  endpointRotated: boolean;
  error: string | null;
};

/**
 * O endpoint do inbound é Comercial? Só nesse caso o caminho canônico se aplica.
 * `purpose` nulo/desconhecido → false (mantém comportamento legado).
 */
export async function isSalesEndpoint(
  service: Db,
  endpointId: string | null | undefined,
): Promise<boolean> {
  if (!endpointId) return false;

  if (endpointId === LEGACY_SPLIT_ENDPOINT_ID) {
    // Endpoint historicamente compartilhado: hoje é Atendimento.
    return Date.now() < LEGACY_SPLIT_AT;
  }

  const { data, error } = await service
    .from("communication_endpoints")
    .select("purpose")
    .eq("id", endpointId)
    .maybeSingle();

  if (error) {
    console.error("[sales-thread] endpoint_purpose_lookup_error", {
      endpoint_id: endpointId,
      error,
    });
    return false;
  }

  const purpose = String((data as { purpose?: string | null } | null)?.purpose ?? "").toLowerCase();
  return purpose === "sales" || purpose === "commercial";
}

/**
 * Retorna a thread Comercial canônica do contato, reabrindo-a e rotacionando o
 * endpoint de resposta quando necessário. Cria UMA thread se não existir.
 */
export async function resolveSalesWhatsappThread(
  service: Db,
  args: {
    organizationId: string;
    contactId: string;
    endpointId: string;
    inboundAt?: string;
    externalId?: string | null;
    /** Uso interno: evita loop na recuperação de corrida da trigger canônica. */
    __retriedAfterGuard?: boolean;

  },
): Promise<SalesThreadResult> {
  const { organizationId, contactId, endpointId } = args;
  const inboundAt = args.inboundAt ?? new Date().toISOString();

  const { data: rows, error: lookupErr } = await service
    .from("message_threads")
    .select("id, status, primary_endpoint_id, resolved_at")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .eq("business_context", "sales")
    .is("merged_into_thread_id", null)
    .order("created_at", { ascending: true })
    .limit(5);

  if (lookupErr) {
    console.error("[sales-thread] canonical_lookup_error", {
      organization_id: organizationId,
      contact_id: contactId,
      error: lookupErr,
    });
    return { threadId: null, outcome: null, endpointRotated: false, error: "canonical_lookup_error" };
  }

  const threads = (rows ?? []) as Array<{
    id: string;
    status: string | null;
    primary_endpoint_id: string | null;
    resolved_at: string | null;
  }>;

  if (threads.length > 1) {
    console.warn("[sales-thread] duplicate_sales_thread_detected", JSON.stringify({
      organization_id: organizationId,
      contact_id: contactId,
      selected_thread_id: threads[0].id,
      all_thread_ids: threads.map((t) => t.id),
    }));
  }

  const canonical = threads[0];

  if (canonical) {
    const needsReopen = ["resolved", "closed"].includes(String(canonical.status ?? "").toLowerCase());
    const endpointRotated = canonical.primary_endpoint_id !== endpointId;

    const update: Record<string, unknown> = {
      whatsapp_last_inbound_at: inboundAt,
      last_inbound_at: inboundAt,
      updated_at: new Date().toISOString(),
    };
    if (args.externalId) update.external_id = args.externalId;
    if (endpointRotated) update.primary_endpoint_id = endpointId;
    if (needsReopen) {
      update.status = "open";
      update.resolved_at = null;
    }

    const { error: updErr } = await service
      .from("message_threads")
      .update(update)
      .eq("id", canonical.id);

    if (updErr) {
      console.error("[sales-thread] canonical_update_error", { thread_id: canonical.id, error: updErr });
    }

    if (endpointRotated) {
      console.log("[sales-thread] SALES_THREAD_ENDPOINT_ROTATED", JSON.stringify({
        thread_id: canonical.id,
        previous_endpoint_id: canonical.primary_endpoint_id,
        new_endpoint_id: endpointId,
      }));
    }
    if (needsReopen) {
      console.log("[sales-thread] SALES_THREAD_REOPENED", JSON.stringify({
        thread_id: canonical.id,
        previous_status: canonical.status,
      }));
    }

    console.log("[sales-thread] canonical_thread_selected", JSON.stringify({
      thread_id: canonical.id,
      outcome: needsReopen ? "reopened" : "reused",
      endpoint_rotated: endpointRotated,
    }));

    return {
      threadId: canonical.id,
      outcome: needsReopen ? "reopened" : "reused",
      endpointRotated,
      error: null,
    };
  }

  const insert: Record<string, unknown> = {
    organization_id: organizationId,
    contact_id: contactId,
    channel: "whatsapp",
    subject: "WhatsApp",
    primary_endpoint_id: endpointId,
    whatsapp_last_inbound_at: inboundAt,
    last_inbound_at: inboundAt,
  };
  if (args.externalId) insert.external_id = args.externalId;

  const { data: created, error: insErr } = await service
    .from("message_threads")
    .insert(insert)
    .select("id")
    .single();

  if (insErr || !created) {
    const insMsg = `${(insErr as { message?: string } | null)?.message ?? ""} ${(insErr as { details?: string } | null)?.details ?? ""}`;
    const blockedByGuard = /SALES_THREAD_DUPLICATE_BLOCKED/i.test(insMsg);

    // HOTFIX: recuperação de corrida. A trigger global de canonicidade pode ter
    // bloqueado este INSERT porque outra transação acabou de criar a thread
    // canônica (ou porque ela existe com primary_endpoint_id divergente).
    // Refaz o lookup canônico UMA única vez antes de falhar.
    if (blockedByGuard && !args.__retriedAfterGuard) {
      console.warn("[sales-thread] SALES_THREAD_GUARD_RACE_RECOVERY", JSON.stringify({
        organization_id: organizationId,
        contact_id: contactId,
        endpoint_id: endpointId,
      }));
      return await resolveSalesWhatsappThread(service, { ...args, __retriedAfterGuard: true });
    }

    console.error("[sales-thread] canonical_insert_error", {
      organization_id: organizationId,
      contact_id: contactId,
      blocked_by_guard: blockedByGuard,
      error: insErr,
    });
    return {
      threadId: null,
      outcome: null,
      endpointRotated: false,
      error: blockedByGuard ? "canonical_guard_blocked" : "canonical_insert_error",
    };
  }


  console.log("[sales-thread] canonical_thread_created", JSON.stringify({
    thread_id: (created as { id: string }).id,
    endpoint_id: endpointId,
  }));

  return {
    threadId: (created as { id: string }).id,
    outcome: "created",
    endpointRotated: false,
    error: null,
  };
}
