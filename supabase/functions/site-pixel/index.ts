// site-pixel: recebe as visitas do pixel do Seialz (public/px/s.js).
// Público (a chave px_ é pública, como a do chat do site). Grava as pistas de
// origem e o IP do visitante (para casar com as conversões), sem o navegador. Devolve o código curto da visita, que o pixel
// põe nas mensagens de WhatsApp e nos formulários.
import { serviceClient } from "../_shared/webchat.ts";
import { cleanVisit } from "../_shared/site-pixel.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Primeiro endereço da cadeia de proxies = o do visitante.
function clientIp(req: Request): string | null {
  const raw = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "";
  const ip = raw.split(",")[0].trim();
  return ip && ip.length <= 45 ? ip : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const raw = await req.text();
  if (raw.length > 8000) return reply({ error: "too_large" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return reply({ error: "invalid_json" }, 400); }
  const key = typeof body.k === "string" ? body.k : "";
  if (!/^px_[a-f0-9]{20}$/.test(key)) return reply({ error: "pixel_not_found" }, 404);
  const visit = cleanVisit(body);
  if (!visit) return reply({ error: "invalid_visit" }, 400);

  const sb = serviceClient();
  const { data, error } = await sb.rpc("site_pixel_record_visit", {
    p_key: key,
    p_visitor: visit.visitorId,
    p_page_host: visit.pageHost,
    p_landing: visit.landingUrl,
    p_referrer_host: visit.referrerHost,
    p_evidence: visit.evidence,
    p_ip: clientIp(req),
  });
  if (error) {
    console.error("[site-pixel] record failed", { code: error.code });
    return reply({ error: "unavailable" }, 503);
  }
  if (!data) return reply({ error: "pixel_not_found" }, 404);
  return reply({ ref: data });
});
