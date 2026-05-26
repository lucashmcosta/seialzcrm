// Shared helper to read intelligence_settings for an organization.
// Small in-memory cache (30s) per isolate to avoid hammering the DB.

export interface IntelligenceSettings {
  capture: {
    whatsapp: boolean;
    inbound: boolean;
    outbound: boolean;
    only_open_deals: boolean;
    ignore_internal_notes: boolean;
  };
  transcription: {
    mode: "all_whatsapp" | "leads_only" | "agents_only" | "open_deals_only" | "off";
    include_lead_audio: boolean;
    include_seller_audio: boolean;
    max_audio_seconds: number;
  };
  behavior: {
    detect_objection: boolean;
    detect_buying_signal: boolean;
    detect_ghosting: boolean;
    detect_premature_lost: boolean;
    min_cadence_before_lost: { messages: number; days: number };
    ghosting_threshold_days: number;
  };
  privacy: {
    transcription_retention_days: number;
    org_opt_out: boolean;
  };
}

const DEFAULTS: IntelligenceSettings = {
  capture: { whatsapp: true, inbound: true, outbound: true, only_open_deals: true, ignore_internal_notes: true },
  transcription: { mode: "all_whatsapp", include_lead_audio: true, include_seller_audio: true, max_audio_seconds: 600 },
  behavior: {
    detect_objection: true,
    detect_buying_signal: true,
    detect_ghosting: true,
    detect_premature_lost: true,
    min_cadence_before_lost: { messages: 3, days: 5 },
    ghosting_threshold_days: 4,
  },
  privacy: { transcription_retention_days: 180, org_opt_out: false },
};

const cache = new Map<string, { at: number; value: IntelligenceSettings }>();
const TTL_MS = 30_000;

export async function getIntelligenceSettings(
  admin: any,
  organizationId: string,
): Promise<IntelligenceSettings> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const { data } = await admin
    .from("intelligence_settings")
    .select("capture, transcription, behavior, privacy")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const merged: IntelligenceSettings = {
    capture: { ...DEFAULTS.capture, ...(data?.capture ?? {}) },
    transcription: { ...DEFAULTS.transcription, ...(data?.transcription ?? {}) },
    behavior: { ...DEFAULTS.behavior, ...(data?.behavior ?? {}) },
    privacy: { ...DEFAULTS.privacy, ...(data?.privacy ?? {}) },
  };

  cache.set(organizationId, { at: Date.now(), value: merged });
  return merged;
}

/**
 * Decides whether a given message should be transcribed based on settings + sender type.
 * sender_type: 'lead' (inbound) or 'seller'/'agent' (outbound)
 */
export function shouldTranscribe(
  settings: IntelligenceSettings,
  ctx: { senderIsLead: boolean; opportunityIsOpen: boolean | null; durationSec?: number },
): { allow: boolean; reason?: string } {
  if (settings.privacy.org_opt_out) return { allow: false, reason: "org_opt_out" };
  const mode = settings.transcription.mode;
  if (mode === "off") return { allow: false, reason: "mode_off" };
  if (ctx.durationSec && ctx.durationSec > settings.transcription.max_audio_seconds) {
    return { allow: false, reason: "exceeds_max_duration" };
  }
  if (ctx.senderIsLead && !settings.transcription.include_lead_audio) return { allow: false, reason: "lead_audio_disabled" };
  if (!ctx.senderIsLead && !settings.transcription.include_seller_audio) return { allow: false, reason: "seller_audio_disabled" };

  switch (mode) {
    case "all_whatsapp": return { allow: true };
    case "leads_only": return ctx.senderIsLead ? { allow: true } : { allow: false, reason: "leads_only" };
    case "agents_only": return !ctx.senderIsLead ? { allow: true } : { allow: false, reason: "agents_only" };
    case "open_deals_only":
      return ctx.opportunityIsOpen ? { allow: true } : { allow: false, reason: "no_open_deal" };
  }
}

/**
 * Decides whether a given message should be analyzed.
 */
export function shouldAnalyze(
  settings: IntelligenceSettings,
  ctx: { direction: "inbound" | "outbound" | null; opportunityIsOpen: boolean | null; channel: string | null; isInternalNote: boolean },
): { allow: boolean; reason?: string } {
  if (settings.privacy.org_opt_out) return { allow: false, reason: "org_opt_out" };
  if (settings.capture.ignore_internal_notes && ctx.isInternalNote) return { allow: false, reason: "internal_note" };
  if (settings.capture.whatsapp && ctx.channel && ctx.channel !== "whatsapp") return { allow: false, reason: "non_whatsapp" };
  if (ctx.direction === "inbound" && !settings.capture.inbound) return { allow: false, reason: "inbound_disabled" };
  if (ctx.direction === "outbound" && !settings.capture.outbound) return { allow: false, reason: "outbound_disabled" };
  if (settings.capture.only_open_deals && ctx.opportunityIsOpen === false) {
    return { allow: false, reason: "deal_not_open" };
  }
  return { allow: true };
}
