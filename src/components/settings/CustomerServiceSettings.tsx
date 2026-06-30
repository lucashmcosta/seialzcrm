import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SpinnerGap, FloppyDisk } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';

/**
 * Configurações → Atendimento
 *
 * Hoje contém uma única opção: permitir que threads de números dedicados de
 * Atendimento (endpoint.purpose = 'customer_service') apareçam na Inbox de
 * Atendimento mesmo quando o contato ainda for lead.
 *
 * Default da org: desligado (comportamento legado preservado).
 */
export function CustomerServiceSettings() {
  const { organization, refetch } = useOrganization();
  const [value, setValue] = useState<boolean>(false);
  const [initial, setInitial] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const v = (organization as any)?.cs_inbox_includes_service_endpoints ?? false;
    setValue(v);
    setInitial(v);
  }, [organization?.id, (organization as any)?.cs_inbox_includes_service_endpoints]);

  const dirty = value !== initial;

  async function handleSave() {
    if (!organization?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ cs_inbox_includes_service_endpoints: value } as any)
        .eq('id', organization.id);
      if (error) throw error;
      toast.success('Configurações de Atendimento salvas.');
      setInitial(value);
      await refetch();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err?.message || 'desconhecido'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-in fade-in duration-200 max-w-2xl space-y-8">
      <section className="space-y-4 rounded-md border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <Label className="text-sm font-medium">
              Incluir threads do número de Atendimento mesmo quando o contato ainda é lead
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ative quando você tiver um número dedicado de Atendimento
              (<code className="font-data text-[11px]">purpose = customer_service</code>).
              Mantenha desligado se usa um único número para Comercial e Atendimento —
              nesse caso a separação continua sendo feita por <em>lifecycle_stage</em>
              (lead → Mensagens, customer → Atendimento).
            </p>
          </div>
          <Switch
            checked={value}
            onCheckedChange={setValue}
            disabled={saving}
            aria-label="Incluir threads do endpoint de Atendimento"
          />
        </div>

        {dirty && (
          <div className="pt-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving
                ? <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />
                : <FloppyDisk className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
