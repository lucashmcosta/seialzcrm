// Pixel do Seialz: limpa o que o navegador manda antes de gravar a visita.
// Guarda só pistas de origem. O endereço perde tudo que não for UTM/clique
// (formulários às vezes põem e-mail ou telefone no endereço) e a página de onde
// a pessoa veio fica só com o domínio.
import { TRACKING_KEYS } from "./landing-tracking.ts";

export interface CleanVisit {
  visitorId: string;
  pageHost: string;
  landingUrl: string;
  referrerHost: string | null;
  evidence: Record<string, string>;
}

const VISITOR = /^[A-Za-z0-9_-]{16,64}$/;
const COOKIE_ID = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]{1,255}$/;

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.host.toLowerCase();
  } catch { return null; }
}

const bare = (host: string) => host.replace(/^www\./, "");

export function cleanVisit(body: unknown): CleanVisit | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const visitorId = typeof b.vid === "string" ? b.vid : "";
  if (!VISITOR.test(visitorId)) return null;
  const url = typeof b.url === "string" ? b.url.slice(0, 2000) : "";
  let page: URL;
  try { page = new URL(url); } catch { return null; }
  if (page.protocol !== "http:" && page.protocol !== "https:") return null;

  const evidence: Record<string, string> = {};
  const landing = new URL(page.origin + page.pathname);
  for (const k of TRACKING_KEYS) {
    const v = page.searchParams.get(k)?.trim();
    if (v && !v.includes("{{")) {
      evidence[k] = v.slice(0, 500);
      landing.searchParams.set(k, evidence[k]);
    }
  }
  const pageHost = page.host.toLowerCase();
  const refHost = typeof b.ref === "string" ? hostOf(b.ref) : null;
  // Navegação dentro do próprio site não é origem.
  const referrerHost = refHost && bare(refHost) !== bare(pageHost) ? refHost : null;
  if (referrerHost) evidence.referrer_url = `https://${referrerHost}/`;
  for (const k of ["fbp", "fbc"] as const) {
    const v = typeof b[k] === "string" ? (b[k] as string).trim() : "";
    if (COOKIE_ID.test(v)) evidence[k] = v;
  }
  evidence.landing_url = landing.toString().slice(0, 1000);
  const hasSignal = TRACKING_KEYS.some((k) => evidence[k]) || !!referrerHost;
  if (!hasSignal) evidence.site_entry = "direct";
  return { visitorId, pageHost, landingUrl: evidence.landing_url, referrerHost, evidence };
}
