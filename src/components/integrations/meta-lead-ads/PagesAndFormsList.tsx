import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Gear, FileText, Warning } from "@phosphor-icons/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  organizationIntegrationId: string;
  onConfigureMapping: (leadFormId: string) => void;
}

export function PagesAndFormsList({ organizationIntegrationId, onConfigureMapping }: Props) {
  const qc = useQueryClient();

  const { data: pages, isLoading } = useQuery({
    queryKey: ["meta-lead-pages", organizationIntegrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_lead_pages")
        .select("id, meta_page_name, meta_page_id, meta_page_category, is_active, last_health_check_status")
        .eq("organization_integration_id", organizationIntegrationId)
        .order("meta_page_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: forms } = useQuery({
    queryKey: ["lead-forms", organizationIntegrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_forms")
        .select(
          "id, provider_form_name, provider_form_id, meta_lead_page_id, is_monitored, is_mapping_configured, last_sync_status, last_synced_at, total_synced_leads, consecutive_errors",
        )
        .eq("organization_integration_id", organizationIntegrationId);
      if (error) throw error;
      return data;
    },
  });

  const toggleMonitor = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("lead_forms")
        .update({ is_monitored: value, ...(value ? { consecutive_errors: 0 } : {}) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-forms"] }),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!pages?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma página descoberta ainda. Clique em "Re-sincronizar" no topo.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {pages.map((page) => {
        const pageForms = forms?.filter((f) => f.meta_lead_page_id === page.id) || [];
        return (
          <div key={page.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{page.meta_page_name}</h3>
              <Badge variant="outline" className="text-[11px]">
                {page.meta_page_category || "Page"}
              </Badge>
              {page.last_health_check_status === "expired" && (
                <Badge variant="destructive" className="text-[11px] gap-1">
                  <Warning className="h-3 w-3" />
                  Token expirado
                </Badge>
              )}
            </div>
            {pageForms.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-2">Sem formulários ativos.</p>
            ) : (
              <div className="border rounded-lg divide-y">
                {pageForms.map((form) => (
                  <div key={form.id} className="flex items-center justify-between p-3 gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{form.provider_form_name}</span>
                          {!form.is_mapping_configured && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Warning className="h-3 w-3" />
                              Mapear campos
                            </Badge>
                          )}
                          {form.last_sync_status === "error" && (
                            <Badge variant="destructive" className="text-[10px]">
                              Erro ({form.consecutive_errors})
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {form.total_synced_leads || 0} leads
                          {form.last_synced_at &&
                            ` · última sync ${format(new Date(form.last_synced_at), "dd/MM HH:mm", {
                              locale: ptBR,
                            })}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => onConfigureMapping(form.id)}>
                        <Gear className="h-4 w-4 mr-1" />
                        Mapear
                      </Button>
                      <Switch
                        checked={form.is_monitored}
                        onCheckedChange={(v) => toggleMonitor.mutate({ id: form.id, value: v })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
