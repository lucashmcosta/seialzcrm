// CTWA (Click-to-WhatsApp) referral → colunas ad_referral_* do contato.
//
// Meta Cloud API: messages[].referral = { source_url, source_id, source_type, headline, body,
// media_type, image_url | video_url, thumbnail_url, ctwa_clid, welcome_message }.
// O ctwa_clid NÃO vem sempre: na prática só vem quando o clique foi no feed/stories do
// Facebook/Instagram (source_url fb.me / instagram.com). Referral com source_url wa.me chega
// sem ctwa_clid. Por isso uma nova referral SEM clid nunca pode apagar um clid já capturado
// (o clid é a chave de atribuição CAPI mais forte; o resto da referral é "último toque").

export interface CtwaReferral {
  source_url: string | null;
  source_id: string | null;
  source_type: string | null;
  headline: string | null;
  body: string | null;
  media_url: string | null;
  ctwa_clid: string | null;
}

// deno-lint-ignore no-explicit-any
export function parseCloudApiReferral(msg: any): CtwaReferral | null {
  const ref = msg?.referral;
  if (!ref || typeof ref !== "object") return null;
  const r: CtwaReferral = {
    source_url: ref.source_url ?? null,
    source_id: ref.source_id ?? null,
    source_type: ref.source_type ?? null,
    headline: ref.headline ?? null,
    body: ref.body ?? null,
    media_url: ref.image_url ?? ref.video_url ?? ref.thumbnail_url ?? null,
    ctwa_clid: ref.ctwa_clid ?? null,
  };
  const has = r.source_url || r.source_id || r.ctwa_clid || r.headline || r.body;
  return has ? r : null;
}

export function buildReferralContactUpdate(ref: CtwaReferral, nowIso: string): Record<string, unknown> {
  const update: Record<string, unknown> = {
    ad_referral_source_url: ref.source_url,
    ad_referral_headline: ref.headline,
    ad_referral_body: ref.body,
    ad_referral_media_url: ref.media_url,
    ad_referral_source_id: ref.source_id,
    ad_referral_source_type: ref.source_type,
    ad_referral_captured_at: nowIso,
    source: "ctwa",
    utm_source: "meta_ads",
    utm_medium: "ctwa",
  };
  // Só escreve o clid quando veio — nunca sobrescreve um clid anterior com null.
  if (ref.ctwa_clid) update.ad_referral_ctwa_clid = ref.ctwa_clid;
  return update;
}
