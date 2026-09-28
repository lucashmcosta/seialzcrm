import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import {
  type CampaignOption,
  commercialDb,
  type CommercialRule,
  type OriginOption,
} from "@/lib/commercialOrigins";

export function useCommercialOrigins() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const settings = useQuery({
    queryKey: ["commercial", orgId, "settings"],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await commercialDb.from(
        "commercial_origin_settings",
      ).select("enabled").eq("organization_id", orgId!).maybeSingle();
      // Safe rollout when frontend is released before the additive migration.
      if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
      return { enabled: data?.enabled === true };
    },
  });
  const options = useQuery({
    queryKey: ["commercial", orgId, "options"],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await commercialDb.from("commercial_origins")
        .select("*").eq("organization_id", orgId!).order("name");
      if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
      return (data || []) as OriginOption[];
    },
  });
  return {
    orgId,
    enabled: settings.data?.enabled === true,
    loading: settings.isLoading,
    error: settings.error || options.error,
    origins: options.data || [],
  };
}
export function useCommercialCampaigns(orgId?: string) {
  return useQuery({
    queryKey: ["commercial", orgId, "campaigns"],
    enabled: !!orgId,
    queryFn: async () => {
      const result: CampaignOption[] = [];
      for (let offset = 0;; offset += 500) {
        const { data, error } = await commercialDb.from("marketing_campaigns")
          .select("id,display_name,campaign_name,platform").eq(
            "organization_id",
            orgId!,
          ).is("deleted_at", null).order("id").range(offset, offset + 499);
        if (error) throw error;
        result.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      return result;
    },
    staleTime: 60000,
  });
}
export function useCommercialRules(orgId?: string) {
  return useQuery({
    queryKey: ["commercial", orgId, "rules"],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await commercialDb.from(
        "commercial_message_rules",
      ).select("*").eq("organization_id", orgId!).order("priority").order(
        "name",
      );
      if (error) throw error;
      return data as CommercialRule[];
    },
  });
}

export interface CommercialHistoryJob {
  status: "pending" | "running" | "complete" | "error";
  examined: number;
  updated: number;
  finished_at: string | null;
  last_error: string | null;
}
export function useCommercialHistoryJob(orgId?: string) {
  return useQuery({
    queryKey: ["commercial", orgId, "history-job"],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await commercialDb.from("commercial_history_jobs")
        .select("status,examined,updated,finished_at,last_error")
        .eq("organization_id", orgId!).maybeSingle();
      if (error) throw error;
      return data as CommercialHistoryJob | null;
    },
    refetchInterval: 10000,
  });
}
