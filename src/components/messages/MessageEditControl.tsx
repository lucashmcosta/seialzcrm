import { useEffect, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { PencilSimple } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { canEditMessage, editErrorMessage, EDIT_WINDOW_MS, type EditableMessageLike } from '@/lib/messageEdit';

export interface EditedPatch { id: string; content: string; edited_at: string; edit_count: number }

interface Props {
  message: EditableMessageLike & { id: string };
  userId: string | null | undefined;
  flagOn: boolean;
  onEdited?: (patch: EditedPatch) => void;
  className?: string;
}

/** Botão "Editar" + caixa de edição. Some sozinho quando passam 15 min. */
export function MessageEditControl({ message, userId, flagOn, onEdited, className }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(message.content ?? '');
  const [saving, setSaving] = useState(false);
  const allowed = canEditMessage(message, userId, flagOn, now);

  useEffect(() => {
    if (!flagOn || !message.sent_at) return;
    const remaining = new Date(message.sent_at).getTime() + EDIT_WINDOW_MS - Date.now();
    if (remaining <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), remaining + 500);
    return () => clearTimeout(t);
  }, [flagOn, message.sent_at]);

  if (!allowed && !open) return null;

  const save = async () => {
    const next = text.trim();
    if (!next) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('evolution-edit-message', {
      body: { message_id: message.id, new_text: next },
    });
    setSaving(false);
    if (error) {
      let code: string | undefined;
      if (error instanceof FunctionsHttpError) {
        try { code = (await error.context.json())?.error; } catch { /* ignore */ }
      }
      toast.error(editErrorMessage(code));
      if (code === 'edit_window_expired') { setOpen(false); setNow(Date.now()); }
      return;
    }
    onEdited?.({ id: message.id, content: data.content, edited_at: data.edited_at, edit_count: data.edit_count });
    toast.success('Edição enviada ao WhatsApp.');
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setText(message.content ?? ''); setOpen(true); }}
        className={className ?? 'p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity'}
        title="Editar"
        aria-label="Editar mensagem"
      >
        <PencilSimple size={15} />
      </button>
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar mensagem</DialogTitle>
            <DialogDescription>
              Disponível por 15 minutos após o envio. O WhatsApp pode não aplicar a alteração para o contato.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={4096}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save(); }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !text.trim() || text.trim() === (message.content ?? '')}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditedBadge({ editedAt, className }: { editedAt?: string | null; className?: string }) {
  if (!editedAt) return null;
  return <span className={className ?? 'text-[11px] leading-[14px] text-muted-foreground/70'}>Editada ·</span>;
}
