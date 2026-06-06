/**
 * Determines the origin of a lead/contact based on attribution signals
 * captured at creation time. No new schema required — reads existing columns.
 */
export type LeadOrigin =
  | { kind: 'meta_form'; label: string }
  | { kind: 'ctwa'; label: string }
  | { kind: 'google_ads'; label: string }
  | { kind: 'landing_page'; label: string }
  | { kind: 'paid_ad'; label: string }
  | { kind: 'organic'; label: string };

interface ContactAttribution {
  ad_referral_source_type?: string | null;
  ad_referral_source_id?: string | null;
  ad_referral_ctwa_clid?: string | null;
  ad_referral_headline?: string | null;
  referrer_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  marketing_campaign_id?: string | null;
  source?: string | null;
}

export function getLeadOrigin(contact: ContactAttribution | null | undefined): LeadOrigin {
  if (!contact) return { kind: 'organic', label: 'Orgânico' };

  // Meta Lead Ads form (capturado pela integração nativa)
  if (contact.ad_referral_source_type === 'lead_ad') {
    return { kind: 'meta_form', label: 'Formulário Meta' };
  }

  // Click-to-WhatsApp: anúncio que abre conversa no WhatsApp
  if (contact.ad_referral_ctwa_clid || contact.ad_referral_source_type === 'ad') {
    return { kind: 'ctwa', label: 'Click-to-WhatsApp' };
  }

  // Google Ads — capturado via marcador [src:gads|g:GCLID] ou UTM padrão
  const paidMediums = ['cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'display'];
  if (
    contact.gclid ||
    contact.source === 'google_ads' ||
    (contact.utm_source?.toLowerCase() === 'google' &&
      contact.utm_medium &&
      paidMediums.includes(contact.utm_medium.toLowerCase()))
  ) {
    return { kind: 'google_ads', label: 'Google Ads' };
  }

  // Tem ID de anúncio Meta capturado mas tipo desconhecido
  if (contact.ad_referral_source_id || contact.ad_referral_headline) {
    return { kind: 'paid_ad', label: 'Anúncio Meta' };
  }

  // Tráfego pago via UTM
  if (
    contact.fbclid ||
    (contact.utm_medium && paidMediums.includes(contact.utm_medium.toLowerCase()))
  ) {
    return { kind: 'paid_ad', label: 'Tráfego Pago' };
  }

  // Landing Page (UTM ou referrer)
  if (contact.referrer_url || contact.utm_source || contact.utm_campaign) {
    return { kind: 'landing_page', label: 'Landing Page' };
  }

  return { kind: 'organic', label: 'Orgânico' };
}

export function getLeadOriginColor(
  kind: LeadOrigin['kind']
): 'brand' | 'success' | 'warning' | 'gray' | 'blue' {
  switch (kind) {
    case 'meta_form':
      return 'blue';
    case 'ctwa':
      return 'success';
    case 'google_ads':
      return 'warning';
    case 'paid_ad':
      return 'warning';
    case 'landing_page':
      return 'brand';
    case 'organic':
    default:
      return 'gray';
  }
}
