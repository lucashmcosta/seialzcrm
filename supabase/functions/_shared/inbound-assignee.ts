// _shared/inbound-assignee.ts
//
// Fonte ÚNICA (lado edge) do "owner sugerido" de um contato NOVO que chega por
// um endpoint pessoal (`communication_endpoints.purpose = 'vendor_personal'`).
// Toda a regra vive na função SQL `fn_resolve_inbound_suggested_assignee`:
//   endpoint da org + is_active + purpose vendor_personal + assigned_user_id
//   + dono com user_organizations.is_active = true  → devolve o dono
//   qualquer outro caso                             → NULL
//
// Contrato desta fase (aprovado):
//   • aplica-se SOMENTE ao payload de INSERT de contato novo;
//   • contato existente NUNCA é alterado por causa do endpoint de entrada;
//   • thread e oportunidade seguem herdando do contato (sem mudança);
//   • sugestão NULL ⇒ payload idêntico ao atual ⇒ round-robin atual roda igual;
//   • nenhuma escrita: função STABLE, só leitura. Falha ⇒ NULL (fail-open para
//     o round-robin), pois o inbound nunca pode ser bloqueado por isto.
//
// Os três providers (Meta, Twilio, Evolution) consomem exatamente este helper.

export async function resolveInboundSuggestedAssignee(
  service: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  organizationId: string,
  endpointId: string | null | undefined,
): Promise<string | null> {
  if (!organizationId || !endpointId) return null;

  try {
    const { data, error } = await service.rpc("fn_resolve_inbound_suggested_assignee", {
      _organization_id: organizationId,
      _endpoint_id: endpointId,
    });

    if (error) {
      console.warn("[inbound-assignee] resolve_error", JSON.stringify({
        endpoint_id: endpointId,
        error: (error as { message?: string })?.message ?? String(error),
      }));
      return null;
    }

    const userId = typeof data === "string" && data.length > 0 ? data : null;
    if (userId) {
      console.log("[inbound-assignee] PERSONAL_ENDPOINT_OWNER_SUGGESTED", JSON.stringify({
        endpoint_id: endpointId,
        suggested_user_id: userId,
      }));
    }
    return userId;
  } catch (e) {
    console.warn("[inbound-assignee] resolve_exception", JSON.stringify({
      endpoint_id: endpointId,
      error: (e as Error)?.message ?? String(e),
    }));
    return null;
  }
}
