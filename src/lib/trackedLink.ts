// Gerador de links com UTM. Cada tipo usa os parâmetros que o motor de origens reconhece,
// para o lead cair na Origem certa (Meta Ads, Google Ads, Social orgânico, E-mail, Indicação…).

export type LinkKind = 'meta_ads' | 'google_ads' | 'other_ads' | 'social' | 'email' | 'referral';

export interface LinkPreset {
  kind: LinkKind;
  label: string;
  /** Origem em que o lead vai aparecer. */
  origin: string;
  /** Pede o nome da rede/fonte (ex.: instagram, tiktok, newsletter). */
  askSource?: string;
  /** Parâmetros preenchidos pela plataforma de anúncio: não pede nome de campanha. */
  macros?: boolean;
  help: string;
}

export const LINK_PRESETS: LinkPreset[] = [
  { kind: 'meta_ads', label: 'Anúncio da Meta (Facebook/Instagram)', origin: 'Meta Ads', macros: true,
    help: 'Cole os parâmetros no campo "Parâmetros de URL" do anúncio. A Meta preenche campanha, conjunto e anúncio sozinha.' },
  { kind: 'google_ads', label: 'Anúncio do Google', origin: 'Google Ads',
    help: 'Use como URL final ou no "Sufixo do URL final". Com a marcação automática do Google ligada, o clique também é reconhecido.' },
  { kind: 'other_ads', label: 'Outro anúncio pago (TikTok, LinkedIn…)', origin: 'Outro pago', askSource: 'tiktok',
    help: 'Coloque o nome da plataforma na fonte.' },
  { kind: 'social', label: 'Rede social sem anúncio (bio, post, story)', origin: 'Social orgânico', askSource: 'instagram',
    help: 'Para link da bio, posts e stories.' },
  { kind: 'email', label: 'E-mail', origin: 'E-mail', askSource: 'newsletter',
    help: 'Para e-mails e newsletters.' },
  { kind: 'referral', label: 'Indicação ou parceiro', origin: 'Indicação', askSource: 'parceiro',
    help: 'Coloque o nome do parceiro na fonte.' },
];

const slug = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Parâmetros na ordem em que aparecem no link. Os da Meta ficam com as chaves {{…}} sem codificar. */
export function trackingParams(kind: LinkKind, campaign: string, source?: string): [string, string][] {
  const c = slug(campaign);
  const s = slug(source || '');
  switch (kind) {
    case 'meta_ads':
      return [['utm_source', '{{site_source_name}}'], ['utm_medium', 'paid'], ['utm_campaign', '{{campaign.name}}'],
        ['utm_term', '{{adset.name}}'], ['utm_content', '{{ad.name}}'], ['meta_ad_id', '{{ad.id}}']];
    case 'google_ads':
      return [['utm_source', 'google'], ['utm_medium', 'cpc'], ['utm_campaign', c || '{campaignid}']];
    case 'other_ads':
      return [['utm_source', s || 'outro'], ['utm_medium', 'paid'], ...(c ? [['utm_campaign', c] as [string, string]] : [])];
    case 'social':
      return [['utm_source', s || 'instagram'], ['utm_medium', 'social'], ...(c ? [['utm_campaign', c] as [string, string]] : [])];
    case 'email':
      return [['utm_source', s || 'newsletter'], ['utm_medium', 'email'], ...(c ? [['utm_campaign', c] as [string, string]] : [])];
    case 'referral':
      return [['utm_source', s || 'parceiro'], ['utm_medium', 'indicacao'], ...(c ? [['utm_campaign', c] as [string, string]] : [])];
  }
}

const enc = (v: string) => (/^\{\{?[a-z_.]+\}\}?$/.test(v) ? v : encodeURIComponent(v));

export function paramsString(kind: LinkKind, campaign: string, source?: string): string {
  return trackingParams(kind, campaign, source).map(([k, v]) => `${k}=${enc(v)}`).join('&');
}

/** Link completo. Mantém os parâmetros que já estão no endereço e troca os de origem. Endereço inválido = null. */
export function buildTrackedLink(url: string, kind: LinkKind, campaign: string, source?: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (!u.hostname.includes('.')) return null;
  const params = trackingParams(kind, campaign, source);
  for (const [k] of params) u.searchParams.delete(k);
  const base = u.toString();
  const extra = params.map(([k, v]) => `${k}=${enc(v)}`).join('&');
  const [noHash, hash] = base.split('#');
  return `${noHash}${noHash.includes('?') ? '&' : '?'}${extra}${hash !== undefined ? `#${hash}` : ''}`;
}
