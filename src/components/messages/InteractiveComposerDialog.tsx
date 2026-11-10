// Janela para enviar botões, lista ou botão de link na conversa, salvar como resposta
// rápida e levar para aprovação da Meta como modelo.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  interactiveFallbackText, normalizeInteractive, validateInteractive, type InteractivePayload,
} from '../../../supabase/functions/_shared/whatsapp-interactive';
import { canBecomeTemplate, interactiveToTemplateDraft, TEMPLATE_DRAFT_STATE_KEY } from '@/lib/interactiveTemplateDraft';
import { emptyInteractive, InteractiveEditor } from './InteractiveEditor';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mensagem já montada (ex.: vinda de uma resposta rápida). */
  initial?: InteractivePayload | null;
  organizationId?: string | null;
  /** Finalidade do número da conversa, usada ao salvar como resposta rápida. */
  purpose?: string | null;
  sending?: boolean;
  onSend: (payload: InteractivePayload) => Promise<void> | void;
}

export function InteractiveComposerDialog({ open, onOpenChange, initial, organizationId, purpose, sending, onSend }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [value, setValue] = useState<InteractivePayload>(initial ?? emptyInteractive());
  const [touched, setTouched] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setValue(initial ?? emptyInteractive()); setTouched(false); setSaveTitle(''); }
  }, [open, initial]);

  const normalized = useMemo(() => normalizeInteractive(value), [value]);
  const problems = useMemo(() => validateInteractive(normalized), [normalized]);

  const send = async () => {
    setTouched(true);
    if (problems.length) return;
    await onSend(normalized);
  };

  const saveAsSnippet = async () => {
    setTouched(true);
    if (problems.length || !organizationId) return;
    if (!saveTitle.trim()) { toast({ variant: 'destructive', description: 'Dê um nome para a resposta rápida.' }); return; }
    setSaving(true);
    const { error } = await supabase.from('message_snippets' as any).insert({
      organization_id: organizationId,
      title: saveTitle.trim(),
      body: interactiveFallbackText(normalized),
      interactive: normalized,
      allowed_purposes: [purpose || 'commercial'],
    });
    setSaving(false);
    if (error) { toast({ variant: 'destructive', description: `Não foi possível salvar: ${error.message}` }); return; }
    toast({ description: 'Resposta rápida salva. Ela aparece ao digitar / na conversa.' });
    setSaveTitle('');
  };

  const goToTemplate = () => {
    setTouched(true);
    if (problems.length) return;
    const draft = interactiveToTemplateDraft(normalized);
    if (!draft) return;
    onOpenChange(false);
    navigate('/whatsapp/templates/new?provider=meta_cloud_api', { state: { [TEMPLATE_DRAFT_STATE_KEY]: draft } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mensagem com botões ou lista</DialogTitle>
          <DialogDescription>A cliente toca na opção em vez de digitar a resposta.</DialogDescription>
        </DialogHeader>

        <InteractiveEditor value={value} onChange={setValue} problems={touched ? problems : []} organizationId={organizationId} />

        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="ix-save">Salvar como resposta rápida (opcional)</Label>
            <Input id="ix-save" value={saveTitle} placeholder="Ex.: Pergunta grávida ou já nasceu" onChange={(e) => setSaveTitle(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={saveAsSnippet} disabled={saving || !organizationId}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={goToTemplate} disabled={!canBecomeTemplate(value)}
            title={canBecomeTemplate(value) ? 'Abre o formulário de modelo já preenchido para enviar à Meta' : 'A Meta não aceita lista em modelo. Use botões ou link.'}>
            Enviar para aprovação como modelo
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" onClick={send} disabled={sending}>{sending ? 'Enviando…' : 'Enviar'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
