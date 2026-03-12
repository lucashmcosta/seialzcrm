import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

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

interface WhatsAppInboundSettingsProps {
  integrationId: string;
}

export function WhatsAppInboundSettings({ integrationId }: WhatsAppInboundSettingsProps) {
  const { organization } = useOrganization();
  const [settings, setSettings] = useState<InboundSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current settings
  const { data: currentSettings, isLoading } = useQuery({
    queryKey: ['whatsapp-inbound-settings', integrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('whatsapp_inbound_settings')
        .eq('id', integrationId)
        .single();

      if (error) throw error;
      return ((data as any)?.whatsapp_inbound_settings as InboundSettings) || DEFAULT_SETTINGS;
    },
    enabled: !!integrationId,
  });

  // Fetch pipeline stages directly
  const { data: stages } = useQuery({
    queryKey: ['pipeline-stages-for-inbound', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, name, order_index')
        .eq('organization_id', organization!.id)
        .order('order_index', { ascending: true });
      if (error) {
        console.error('Error fetching pipeline_stages:', error);
        return [];
      }
      return (data as any[]) || [];
    },
    enabled: !!organization?.id && settings.auto_create_opportunity,
  });

  useEffect(() => {
    if (currentSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...currentSettings });
    }
  }, [currentSettings]);

  const updateSetting = <K extends keyof InboundSettings>(key: K, value: InboundSettings[K]) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      if (key === 'auto_create_opportunity' && !value) {
        updated.default_pipeline_id = null;
        updated.default_stage_id = null;
      }
      return updated;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('organization_integrations')
        .update({ whatsapp_inbound_settings: settings as any })
        .eq('id', integrationId);

      if (error) throw error;
      toast.success('Configurações de entrada salvas!');
      setHasChanges(false);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="text-sm font-semibold">Regras de Entrada</h4>

      {/* Auto create contact */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm">Criar contato automaticamente</Label>
          <p className="text-xs text-muted-foreground">
            Quando receber mensagem de número desconhecido
          </p>
        </div>
        <Switch
          checked={settings.auto_create_contact}
          onCheckedChange={(v) => updateSetting('auto_create_contact', v)}
        />
      </div>

      {/* Lifecycle stage */}
      {settings.auto_create_contact && (
        <div className="space-y-2">
          <Label className="text-sm">Estágio do ciclo de vida</Label>
          <select
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={settings.default_lifecycle_stage}
            onChange={(e) => updateSetting('default_lifecycle_stage', e.target.value)}
          >
            {LIFECYCLE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Auto create opportunity */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm">Criar oportunidade automaticamente</Label>
          <p className="text-xs text-muted-foreground">
            Ao criar um novo contato via WhatsApp
          </p>
        </div>
        <Switch
          checked={settings.auto_create_opportunity}
          onCheckedChange={(v) => updateSetting('auto_create_opportunity', v)}
        />
      </div>

      {/* Stage selector */}
      {settings.auto_create_opportunity && (
        <div className="space-y-3 pl-4 border-l-2 border-primary/20">
          <div className="space-y-2">
            <Label className="text-sm">Etapa inicial do pipeline</Label>
            {stages && stages.length > 0 ? (
              <select
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={settings.default_stage_id || ''}
                onChange={(e) => updateSetting('default_stage_id', e.target.value || null)}
              >
                <option value="">Primeira etapa (padrão)</option>
                {stages.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhuma etapa cadastrada. Crie um pipeline em Configurações &gt; Pipeline.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Save button */}
      {hasChanges && (
        <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Regras
        </Button>
      )}
    </div>
  );
}
