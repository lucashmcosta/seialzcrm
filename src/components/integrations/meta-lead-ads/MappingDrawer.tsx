import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { QuestionMappingCard } from "./QuestionMappingCard";

interface Props {
  leadFormId: string | null;
  organizationId?: string;
  open: boolean;
  onClose: () => void;
}

export function MappingDrawer({ leadFormId, organizationId, open, onClose }: Props) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, any>>({});

  const { data: questions, isLoading } = useQuery({
    queryKey: ["lead-form-questions", leadFormId],
    enabled: !!leadFormId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_form_questions")
        .select("*")
        .eq("lead_form_id", leadFormId!)
        .order("field_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: customFieldsContacts } = useQuery({
    queryKey: ["custom-fields", organizationId, "contacts"],
    enabled: !!organizationId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_field_definitions")
        .select("id, label, name, field_type")
        .eq("organization_id", organizationId!)
        .eq("module", "contacts")
        .order("label");
      return (data || []).map((d: any) => ({
        id: d.id,
        field_label: d.label,
        field_key: d.name,
      }));
    },
  });

  const { data: customFieldsOpps } = useQuery({
    queryKey: ["custom-fields", organizationId, "opportunities"],
    enabled: !!organizationId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_field_definitions")
        .select("id, label, name, field_type")
        .eq("organization_id", organizationId!)
        .eq("module", "opportunities")
        .order("label");
      return (data || []).map((d: any) => ({
        id: d.id,
        field_label: d.label,
        field_key: d.name,
      }));
    },
  });

  const { data: tags } = useQuery({
    queryKey: ["tags", organizationId],
    enabled: !!organizationId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("tags")
        .select("id, name, color")
        .eq("organization_id", organizationId!)
        .order("name");
      return data || [];
    },
  });

  useEffect(() => {
    if (questions) {
      const next: Record<string, any> = {};
      for (const q of questions) next[q.id] = { ...q };
      setDrafts(next);
    }
  }, [questions]);

  const save = useMutation({
    mutationFn: async () => {
      const updates = Object.values(drafts) as any[];
      for (const q of updates) {
        const { error } = await supabase
          .from("lead_form_questions")
          .update({
            target_entity: q.target_entity || "contact",
            mapping_strategy: q.mapping_strategy,
            mapped_to_contact_field: q.mapped_to_contact_field,
            custom_field_definition_id: q.custom_field_definition_id,
            tag_strategy: q.tag_strategy,
            tag_prefix: q.tag_prefix,
            tag_color: q.tag_color,
            fixed_tag_id: q.fixed_tag_id,
            is_configured: true,
          })
          .eq("id", q.id);
        if (error) throw error;
      }
      if (leadFormId) {
        await supabase.from("lead_forms").update({ is_mapping_configured: true }).eq("id", leadFormId);
      }
    },
    onSuccess: () => {
      toast.success("Mapeamento salvo");
      qc.invalidateQueries({ queryKey: ["lead-forms"] });
      qc.invalidateQueries({ queryKey: ["lead-form-questions"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Mapeamento de campos</SheetTitle>
          <SheetDescription>
            Defina como cada pergunta do formulário será gravada no contato.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {isLoading || !questions ? (
            <Skeleton className="h-40 w-full" />
          ) : questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma pergunta sincronizada. Re-sincronize a integração.
            </p>
          ) : (
            questions.map((q) => (
              <QuestionMappingCard
                key={q.id}
                question={drafts[q.id] || q}
                customFields={customFields || []}
                tags={tags || []}
                onChange={(patch) =>
                  setDrafts((d) => ({ ...d, [q.id]: { ...(d[q.id] || q), ...patch } }))
                }
              />
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6 sticky bottom-0 bg-background py-3">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar mapeamento"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
