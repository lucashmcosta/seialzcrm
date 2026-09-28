import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Additive schema lives in 20260925 migrations; legacy generated types remain untouched.
export const commercialDb = supabase as SupabaseClient;
export interface CommercialOrigin {
  origin_id: string | null;
  name: string;
  campaign_id: string | null;
  campaign_name: string | null;
  method: string;
  channel: string | null;
  pending: boolean;
  revision: number;
  event_id: string | null;
}
export interface OriginOption {
  id: string;
  name: string;
  active: boolean;
  code: string;
}
export interface CampaignOption {
  id: string;
  display_name: string | null;
  campaign_name: string | null;
  platform: string;
}
export interface CommercialRule {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  endpoint_id: string | null;
  operator: "exact" | "contains";
  pattern: string;
  origin_id: string;
  campaign_id: string | null;
  version: number;
}
export interface CommercialFilters {
  origin: string;
  campaign: string;
  method: string;
  channel: string;
  pending: boolean;
}
export const emptyCommercialFilters: CommercialFilters = {
  origin: "",
  campaign: "",
  method: "",
  channel: "",
  pending: false,
};
export const methodLabels: Record<string, string> = {
  direct: "Evidência direta",
  message_rule: "Regra de mensagem",
  manual: "Manual",
  migrated: "Migrado",
  unknown: "Não identificada",
};
export const dayAfter = (date: string) =>
  date
    ? new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString()
    : "";
export async function commercialRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await commercialDb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const campaignLabel = (c: CampaignOption) =>
  c.display_name || c.campaign_name || c.id;

export interface CommercialSelection {
  origin: string;
  campaign: string;
  event: string;
}
export const emptyCommercialSelection: CommercialSelection = {
  origin: "",
  campaign: "",
  event: "",
};
