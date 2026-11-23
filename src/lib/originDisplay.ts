// Como mostrar a origem para o time: Origem + Detalhe + "Entrou por", sem termos técnicos.

/** Por onde o contato chegou (fixo, automático). Separado da Origem de marketing. */
export function entryLabel(source: string | null | undefined): string {
  const s = (source || '').toLowerCase();
  if (!s) return 'Cadastro manual';
  if (s === 'webchat') return 'Chat do site';
  if (s === 'ctwa' || s.includes('whatsapp')) return 'WhatsApp';
  if (s === 'meta_lead_ads' || s === 'meta') return 'Formulário da Meta';
  if (s.includes('landing') || s === 'api' || s === 'form') return 'Formulário do site';
  if (s === 'inbound_call') return 'Ligação';
  if (s === 'kommo' || s.includes('import')) return 'Importação';
  if (s === 'gads' || s === 'google_ads') return 'Formulário do Google';
  return 'Outro';
}

export interface OriginCampaign {
  campaign_name?: string | null;
  adset_name?: string | null;
  ad_name?: string | null;
  display_name?: string | null;
}

/** Detalhe em níveis: campanha › conjunto › anúncio. Sem campanha ligada, usa o nome que veio no link. */
export function detailParts(campaign: OriginCampaign | null | undefined, evidence?: Record<string, unknown> | null): string[] {
  const parts = [campaign?.campaign_name, campaign?.adset_name, campaign?.ad_name]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  if (parts.length) return [...new Set(parts)];
  if (campaign?.display_name) return [campaign.display_name];
  const fromLink = typeof evidence?.utm_campaign === 'string' && !evidence.utm_campaign.includes('{{') ? evidence.utm_campaign.trim() : '';
  return fromLink ? [fromLink] : [];
}

/** Como a origem foi definida, só quando ajuda o vendedor a confiar nela. */
export function methodNote(method: string | null | undefined): string | null {
  if (method === 'manual') return 'Corrigida manualmente';
  if (method === 'inherited') return 'Herdada do contato';
  if (method === 'message_rule') return 'Pela mensagem recebida';
  return null;
}
