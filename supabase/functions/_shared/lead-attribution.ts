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
    "utm_term", "utm_id", "utm_source_platform", "fbclid", "gclid", "meta_ad_id",
    "meta_adset_id", "meta_campaign_id", "landing_url", "referrer_url"]) {
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
