// Aceite de marketing do contato por canal (WhatsApp, e-mail). Grava na hora, com histórico
// (rpc_set_contact_consent_v1). "Não contatar" continua valendo acima disto.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { uiText } from '@/lib/ui-locale';

type Channel = 'whatsapp' | 'email';
interface ConsentRow { channel: string; status: 'granted' | 'revoked'; source: string; updated_at: string }

const CHANNELS: Array<{ id: Channel; label: string }> = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'E-mail' },
];

const SOURCE_LABEL: Record<string, string> = {
  webhook: 'formulário (webhook)',
  form: 'formulário',
  whatsapp_button: 'botão do WhatsApp',
  unsubscribe_link: 'link de descadastro',
  user: 'equipe',
  import: 'importação',
  api: 'API',
};

export function ContactMarketingConsent({ contactId }: { contactId: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<Channel | null>(null);
  const { data: rows, isLoading } = useQuery({
    queryKey: ['contact-consents', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_consents' as never)
        .select('channel, status, source, updated_at')
        .eq('contact_id', contactId)
        .eq('purpose', 'marketing');
      if (error) throw error;
      return (data ?? []) as unknown as ConsentRow[];
    },
  });

  const toggle = async (channel: Channel, granted: boolean) => {
    setSaving(channel);
    const { error } = await supabase.rpc('rpc_set_contact_consent_v1' as never, {
      p_contact_id: contactId, p_channel: channel, p_granted: granted, p_source: 'user',
    } as never);
    setSaving(null);
    if (error) { toast.error(uiText('Não foi possível salvar o aceite.')); return; }
    queryClient.invalidateQueries({ queryKey: ['contact-consents', contactId] });
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{uiText('Aceite de marketing')}</p>
        <p className="text-xs text-muted-foreground">
          {uiText('Conteúdos e ofertas automáticos só saem com aceite. Mensagens do atendimento não dependem disto.')}
        </p>
      </div>
      {CHANNELS.map((c) => {
        const row = rows?.find((r) => r.channel === c.id);
        const granted = row?.status === 'granted';
        const detail = row
          ? `${granted ? uiText('Aceitou') : uiText('Recusou')} · ${uiText('por')} ${uiText(SOURCE_LABEL[row.source] ?? row.source)} · ${new Date(row.updated_at).toLocaleDateString()}`
          : uiText('Sem registro (não recebe marketing)');
        return (
          <div key={c.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor={`consent-${c.id}`} className="text-sm">{c.label}</Label>
              <p className="truncate text-xs text-muted-foreground">{isLoading ? uiText('Carregando...') : detail}</p>
            </div>
            <Switch
              id={`consent-${c.id}`}
              checked={granted}
              disabled={isLoading || saving !== null}
              onCheckedChange={(v) => toggle(c.id, v)}
            />
          </div>
        );
      })}
    </div>
  );
}
