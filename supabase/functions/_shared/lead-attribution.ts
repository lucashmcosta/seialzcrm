/** Attribution fields only: never copy arbitrary form answers into commercial evidence. */
export function normalizeLeadAttribution(payload: Record<string, unknown>): Record<string, string> {
  const object = (value: unknown): Record<string, unknown> => {
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { return {}; }
    }
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  };
  const params = object(payload.all_params);
  const layers = [payload, object(payload.utms), params, object(params.utms), object(params.raw)];
  const result: Record<string, string> = {};
  for (const field of ["source", "utm_source", "utm_medium", "utm_campaign", "utm_content",
    "utm_term", "utm_id", "utm_source_platform", "fbclid", "gclid", "gbraid", "wbraid", "meta_ad_id",
    "meta_adset_id", "meta_campaign_id", "landing_url", "referrer_url",
    // Campos que o pixel do Seialz põe no formulário.
    "fbp", "fbc", "site_entry", "sz_ref"]) {
    const alias = field.startsWith("meta_") ? field.slice(5) : field;
    for (const layer of layers) {
      const value = layer[field] ?? layer[alias];
      if (typeof value === "string" && value.trim() && !value.includes("{{")) {
        result[field] = value.trim();
        break;
      }
    }
  }
  return result;
}

export function leadCommercialEvidence(attribution: Record<string, string>): Record<string, string> {
  return { ...attribution, ...(attribution.meta_ad_id ? { ad_id: attribution.meta_ad_id } : {}) };
}

/** Campos de origem gravados na oportunidade criada pelo webhook (só atribuição, nunca respostas do formulário). */
export function opportunityOrigin(source: unknown, attribution: Record<string, string>) {
  return {
    source: (typeof source === 'string' && source.trim()) ? source.trim() : "api",
    utm_source: attribution.utm_source || null,
    utm_medium: attribution.utm_medium || null,
    utm_campaign: attribution.utm_campaign || null,
    utm_content: attribution.utm_content || null,
    utm_term: attribution.utm_term || null,
    attribution_data: attribution,
  };
}
