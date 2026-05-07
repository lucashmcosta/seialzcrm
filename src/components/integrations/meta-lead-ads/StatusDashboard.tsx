import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

interface Props {
  organizationId: string;
}

export function StatusDashboard({ organizationId }: Props) {
  const { data } = useQuery({
    queryKey: ["meta-lead-ads-stats", organizationId],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [forms, leads24h, errorForms] = await Promise.all([
        supabase
          .from("lead_forms")
          .select("id, total_synced_leads, last_sync_status, consecutive_errors, is_monitored")
          .eq("organization_id", organizationId)
          .eq("provider", "meta_lead_ads"),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("source", "meta_lead_ads")
          .gte("created_at", since),
        supabase
          .from("lead_forms")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("provider", "meta_lead_ads")
          .gte("consecutive_errors", 1),
      ]);
      const totalLeads = (forms.data || []).reduce((s, f: any) => s + (f.total_synced_leads || 0), 0);
      const monitored = (forms.data || []).filter((f: any) => f.is_monitored).length;
      return {
        totalLeads,
        leads24h: leads24h.count || 0,
        monitored,
        errorForms: errorForms.count || 0,
      };
    },
  });

  const Stat = ({ label, value, tone = "default" }: any) => (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-semibold mt-1 ${
          tone === "danger" ? "text-destructive" : tone === "success" ? "text-green-600" : ""
        }`}
      >
        {value ?? "—"}
      </p>
    </Card>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="Leads 24h" value={data?.leads24h} tone="success" />
      <Stat label="Total sincronizado" value={data?.totalLeads} />
      <Stat label="Formulários monitorados" value={data?.monitored} />
      <Stat label="Formulários com erro" value={data?.errorForms} tone={data?.errorForms ? "danger" : "default"} />
    </div>
  );
}
