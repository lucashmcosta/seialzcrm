// Sem dependências de Deno, para os testes.

export function parseViewRequest(body: unknown): { organizationId: string; opportunityId: string } | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const org = typeof b.organizationId === "string" ? b.organizationId : "";
  const opp = typeof b.opportunityId === "string" ? b.opportunityId : "";
  return uuid.test(org) && uuid.test(opp) ? { organizationId: org, opportunityId: opp } : null;
}

/** Só o processo desta oportunidade, e só os campos que a tela usa. */
export function viewResponse(data: Record<string, unknown> | null, opportunityId: string) {
  const list = Array.isArray(data?.processes) ? data!.processes as Array<Record<string, unknown>> : [];
  const p = list.find((x) => x && x.seialz_opportunity_id === opportunityId);
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []) as Array<Record<string, unknown>>;
  return {
    available: true,
    agenda: arr(p?.agenda).map((e) => ({
      external_event_id: String(e.id ?? ""),
      event_type: String(e.type ?? ""),
      subtype: (e.subtype as string | null) ?? null,
      status: String(e.status ?? ""),
      start_at: String(e.start_at ?? ""),
      end_at: (e.end_at as string | null) ?? null,
      all_day: e.all_day === true,
      timezone: (e.timezone as string | null) ?? null,
      modality: (e.modality as string | null) ?? null,
      location: (e.location as string | null) ?? null,
      virtual_link: (e.virtual_link as string | null) ?? null,
      removed_at: null,
    })).filter((e) => e.external_event_id && e.event_type && e.start_at),
    timeline: arr(p?.timeline).map((t) => ({
      at: String(t.at ?? ""),
      title: String(t.title ?? ""),
      description: (t.description as string | null) ?? null,
      attention: t.attention === true,
    })).filter((t) => t.at && t.title),
  };
}
