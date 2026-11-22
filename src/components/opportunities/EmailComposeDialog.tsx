// E-mail avulso pela oportunidade: modelo ou texto livre, com prévia preenchida e avisos antes de enviar.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { uiText } from '@/lib/ui-locale';

const FREE = '__free__';

export function EmailComposeDialog({ organizationId, opportunityId, onClose, onSent }: {
  organizationId: string; opportunityId: string; onClose: () => void; onSent: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>(FREE);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<{ to: string | null; subject: string; body: string; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: templates } = useQuery({
    queryKey: ['email-templates-compose', organizationId],
    queryFn: async () => {
      const { data } = await supabase.from('email_templates' as never).select('id, name, is_marketing')
        .eq('organization_id', organizationId).is('deleted_at', null).order('name');
      return (data ?? []) as unknown as Array<{ id: string; name: string; is_marketing: boolean }>;
    },
  });

  const payload = () => ({
    organization_id: organizationId, opportunity_id: opportunityId,
    ...(templateId === FREE ? { subject, body } : { template_id: templateId }),
  });
  const ready = templateId !== FREE || (subject.trim() && body.trim());

  const doPreview = async () => {
    if (!ready) { setPreview(null); return; }
    const { data } = await supabase.functions.invoke('email-send', { body: { ...payload(), preview: true } });
    if (data?.ok) setPreview(data);
  };
  useEffect(() => { const t = setTimeout(doPreview, 500); return () => clearTimeout(t); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, subject, body]);

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('email-send', { body: payload() });
    setBusy(false);
    if (error || !data?.ok) {
      let msg = uiText('Não foi possível enviar.');
      try { const j = await (error as { context?: Response })?.context?.json(); if (j?.warnings?.length) msg = j.warnings.join(' · '); else if (j?.reason) msg = j.reason; } catch { /* sem corpo */ }
      toast.error(msg);
      return;
    }
    toast.success(uiText('E-mail enviado'));
    onSent();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{uiText('Enviar e-mail')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{uiText('Modelo')}</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FREE}>{uiText('Escrever agora')}</SelectItem>
                {(templates ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_marketing ? ` · ${uiText('marketing')}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {templateId === FREE && (
            <>
              <div className="space-y-1"><Label>{uiText('Assunto')}</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div className="space-y-1"><Label>{uiText('Texto')}</Label>
                <Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder={uiText('Oi, {{contact.first_name}}!')} />
              </div>
            </>
          )}
          {preview && (
            <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
              <p className="text-xs text-muted-foreground">{uiText('Para')}: {preview.to ?? uiText('(sem e-mail)')}</p>
              <p className="font-medium">{preview.subject}</p>
              <p className="whitespace-pre-wrap text-xs">{preview.body}</p>
              {preview.warnings.map((w) => <p key={w} className="text-xs text-destructive">{uiText(w)}</p>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>{uiText('Cancelar')}</Button>
          <Button disabled={busy || !ready || !!preview?.warnings.length} onClick={send}>{busy ? uiText('Enviando...') : uiText('Enviar')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
