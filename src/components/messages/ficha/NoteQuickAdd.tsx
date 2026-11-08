// Nota rápida na Ficha lateral (Fase 3). Usa a MESMA função do modo nota do composer
// (addConversationNote no MessagesList): grava em activities (type=note) e a nota
// aparece na timeline da conversa na hora.
import { useState } from 'react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { uiText, useUiLocale } from '@/lib/ui-locale';

export function NoteQuickAdd({ onAddNote }: { onAddNote: (text: string) => Promise<boolean> }) {
  useUiLocale();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    const ok = await onAddNote(value);
    setSaving(false);
    if (ok) {
      setText('');
      toast.success(uiText('Nota adicionada na conversa'));
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{uiText('Nota rápida')}</h3>
      <Textarea
        value={text}
        rows={3}
        placeholder={uiText('Escreva uma nota interna (o cliente não vê)')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{uiText('Ctrl/⌘ + Enter para salvar')}</span>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!text.trim() || saving} onClick={() => { void submit(); }}>
          {uiText('Adicionar nota')}
        </Button>
      </div>
    </section>
  );
}
