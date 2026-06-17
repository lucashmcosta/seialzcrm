import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SpinnerGap, FloppyDisk } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface InboundSettings {
  auto_create_contact: boolean;
  default_lifecycle_stage: string;
  auto_create_opportunity: boolean;
  default_pipeline_id: string | null;
  default_stage_id: string | null;
  default_opportunity_owner: string;
}

const DEFAULT_SETTINGS: InboundSettings = {
  auto_create_contact: true,
  default_lifecycle_stage: 'lead',
  auto_create_opportunity: false,
  default_pipeline_id: null,
  default_stage_id: null,
  default_opportunity_owner: 'contact_owner',
};

const LIFECYCLE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'subscriber', label: 'Subscriber' },
  { value: 'opportunity', label: 'Oportunidade' },
  { value: 'customer', label: 'Cliente' },
];

interface Props {
  endpointId: string;
  integrationFallback: Partial<InboundSettings> | null;
}

export function EndpointInboundSettings({ endpointId, integrationFallback }: Props) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [useGeneral, setUseGeneral] = useState(true);
  const [settings, setSettings] = useState<InboundSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: current, isLoading } = useQuery({
    queryKey: ['endpoint-inbound', endpointId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_endpoints')
        .select('inbound_settings')
        .eq('id', endpointId)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.inbound_settings as InboundSettings | null;
    },
    enabled: !!endpointId,
  });

  const fallback: InboundSettings = { ...DEFAULT_SETTINGS, ...(integrationFallback || {}) };

  useEffect(() => {
    if (current === undefined) return;
    if (current === null) {
      setUseGeneral(true);
      setSettings(fallback);
    } else {
      setUseGeneral(false);
      setSettings({ ...DEFAULT_SETTINGS, ...current });
    }
    setHasChanges(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const { data: stages } = useQuery({
    queryKey: ['pipeline-stages-for-inbound', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, name, order_index')
        .eq('organization_id', organization!.id)
        .order('order_index', { ascending: true });
      if (error) return [];
      return (data as any[]) || [];
    },
    enabled: !!organization?.id,
  });

  const update = <K extends keyof InboundSettings>(key: K, value: InboundSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'auto_create_opportunity' && !value) {
        next.default_pipeline_id = null;
        next.default_stage_id = null;
      }
      return next;
    });
    setHasChanges(true);
  };

  const handleToggleGeneral = (v: boolean) => {
    setUseGeneral(v);
    if (v) {
      setSettings(fallback);
    }
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = useGeneral ? null : (settings as any);
      const { error } = await supabase
        .from('communication_endpoints')
        .update({ inbound_settings: payload })
        .eq('id', endpointId);
      if (error) throw error;
      toast.success('Regras do número salvas!');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['endpoint-inbound', endpointId] });
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <SpinnerGap className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const disabled = useGeneral;

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-semibold">Regras de Entrada deste número</Label>
          <p className="text-xs text-muted-foreground">
            {useGeneral ? 'Herdando regras gerais da integração' : 'Usando regras personalizadas'}
          </p>
        </div>
        <Switch checked={useGeneral} onCheckedChange={handleToggleGeneral} />
      </div>

      <div className={disabled ? 'opacity-60 pointer-events-none space-y-4' : 'space-y-4'}>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Criar contato automaticamente</Label>
          </div>
          <Switch
            checked={settings.auto_create_contact}
            onCheckedChange={(v) => update('auto_create_contact', v)}
            disabled={disabled}
          />
        </div>

        {settings.auto_create_contact && (
          <div className="space-y-2">
            <Label className="text-sm">Estágio do ciclo de vida</Label>
            <select
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={settings.default_lifecycle_stage}
              onChange={(e) => update('default_lifecycle_stage', e.target.value)}
              disabled={disabled}
            >
              {LIFECYCLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Criar oportunidade automaticamente</Label>
          </div>
          <Switch
            checked={settings.auto_create_opportunity}
            onCheckedChange={(v) => update('auto_create_opportunity', v)}
            disabled={disabled}
          />
        </div>

        {settings.auto_create_opportunity && (
          <div className="space-y-2 pl-4 border-l-2 border-primary/20">
            <Label className="text-sm">Etapa inicial do pipeline</Label>
            {stages && stages.length > 0 ? (
              <select
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={settings.default_stage_id || ''}
                onChange={(e) => update('default_stage_id', e.target.value || null)}
                disabled={disabled}
              >
                <option value="">Primeira etapa (padrão)</option>
                {stages.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma etapa cadastrada.</p>
            )}
          </div>
        )}
      </div>

      {hasChanges && (
        <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? <SpinnerGap className="h-4 w-4 mr-2 animate-spin" /> : <FloppyDisk className="h-4 w-4 mr-2" />}
          Salvar Regras deste Número
        </Button>
      )}
    </div>
  );
}
