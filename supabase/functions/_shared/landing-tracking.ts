// Parâmetros de origem que vêm no endereço da página (UTMs, cliques de anúncio).
// O chat do site manda só o endereço; aqui eles viram campos de origem.

export const TRACKING_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "fbclid", "gclid", "gbraid", "wbraid", "meta_ad_id",
] as const;

/** Junta o que o cliente mandou com o que está no endereço da página. O que o cliente mandou vence. */
export function trackingFromLanding(landingUrl: unknown, sent: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof landingUrl === "string" && landingUrl) {
    try {
      const params = new URL(landingUrl).searchParams;
      for (const k of TRACKING_KEYS) {
        const v = params.get(k)?.trim();
        if (v) out[k] = v.slice(0, 500);
      }
    } catch { /* endereço inválido: ignora */ }
  }
  if (sent && typeof sent === "object" && !Array.isArray(sent)) {
    for (const [k, v] of Object.entries(sent as Record<string, unknown>)) {
      if ((TRACKING_KEYS as readonly string[]).includes(k) && typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 500);
    }
  }
  return out;
}
