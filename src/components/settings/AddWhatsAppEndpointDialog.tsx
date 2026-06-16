import { useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ArrowsClockwise } from '@phosphor-icons/react';

const schema = z.object({
  external_address: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Use formato E.164 (ex.: +5511999999999)'),
  sender_sid: z
    .string()
    .trim()
    .regex(/^XE[a-zA-Z0-9]{32}$/, 'Sender SID inválido (deve começar com XE e ter 34 caracteres)'),
  display_name: z.string().trim().max(100).optional().or(z.literal('')),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddWhatsAppEndpointDialog({ open, onOpenChange, onSuccess }: Props) {
  const { organization } = useOrganization();
  const [externalAddress, setExternalAddress] = useState('');
  const [senderSid, setSenderSid] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setExternalAddress('');
    setSenderSid('');
    setDisplayName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) {
      toast.error('Organização não identificada');
      return;
    }

    const parsed = schema.safeParse({
      external_address: externalAddress,
      sender_sid: senderSid,
      display_name: displayName,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || 'Dados inválidos');
      return;
    }

    setSubmitting(true);
    try {
      // Buscar a integration twilio-whatsapp ativa da org
      const { data: integ, error: integErr } = await supabase
        .from('organization_integrations')
        .select('id, config_values, admin_integrations!inner(slug)')
        .eq('organization_id', organization.id)
        .eq('admin_integrations.slug', 'twilio-whatsapp')
        .eq('is_enabled', true)
        .maybeSingle();

      if (integErr) throw integErr;
      if (!integ) {
        toast.error('Integração Twilio WhatsApp não encontrada nesta organização');
        return;
      }

      const accountSid = (integ.config_values as any)?.account_sid;
      if (!accountSid) {
        toast.error('AccountSid Twilio não configurado na integração');
        return;
      }

      const { error: insErr } = await supabase.from('communication_endpoints').insert({
        organization_id: organization.id,
        organization_integration_id: integ.id,
        channel: 'whatsapp',
        external_address: parsed.data.external_address,
        external_account_id: accountSid,
        sender_sid: parsed.data.sender_sid,
        display_name: parsed.data.display_name?.length ? parsed.data.display_name : null,
        is_active: true,
        status: 'online',
        metadata: {},
      });

      if (insErr) {
        const msg = insErr.message || '';
        if (msg.toLowerCase().includes('duplicate') || msg.includes('unique')) {
          toast.error('Este número já está cadastrado nesta organização');
        } else {
          toast.error('Erro ao cadastrar: ' + msg);
        }
        return;
      }

      toast.success('Número WhatsApp cadastrado com sucesso');
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error('Erro ao cadastrar: ' + (err?.message || 'desconhecido'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adicionar número WhatsApp</DialogTitle>
            <DialogDescription>
              Cadastre um novo sender WhatsApp do Twilio para esta organização.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="external_address">Número WhatsApp (E.164)</Label>
              <Input
                id="external_address"
                placeholder="+5511999999999"
                value={externalAddress}
                onChange={(e) => setExternalAddress(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sender_sid">Sender SID Twilio</Label>
              <Input
                id="sender_sid"
                placeholder="XE..."
                value={senderSid}
                onChange={(e) => setSenderSid(e.target.value)}
                disabled={submitting}
                required
              />
              <p className="text-xs text-muted-foreground">
                Encontrado em Twilio Console → Messaging → WhatsApp Senders.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_name">Nome de exibição (opcional)</Label>
              <Input
                id="display_name"
                placeholder="Ex.: CT — Lucas"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={submitting}
                maxLength={100}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <ArrowsClockwise className="h-4 w-4 mr-2 animate-spin" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
