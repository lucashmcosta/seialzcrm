// Editor de mensagem interativa (botões, lista ou botão de link) com prévia.
// As regras vêm de _shared/whatsapp-interactive.ts, as mesmas que o servidor aplica.
import { useState } from 'react';
import { Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  INTERACTIVE_LIMITS as L,
  type InteractivePayload,
} from '../../../supabase/functions/_shared/whatsapp-interactive';
import { InteractiveMessageCard } from './InteractiveMessageCard';

export type InteractiveKind = InteractivePayload['kind'];

export function emptyInteractive(kind: InteractiveKind = 'buttons'): InteractivePayload {
  if (kind === 'list') return { kind, body: '', buttonText: 'Ver opções', sections: [{ rows: [{ id: '', title: '' }, { id: '', title: '' }] }] };
  if (kind === 'cta_url') return { kind, body: '', displayText: '', url: '' };
  return { kind: 'buttons', body: '', buttons: [{ id: '', title: '' }, { id: '', title: '' }] };
}

/** Troca o tipo aproveitando o texto e as opções já digitados. */
export function switchKind(p: InteractivePayload, kind: InteractiveKind): InteractivePayload {
  if (p.kind === kind) return p;
  const base = { body: p.body, header: p.header, footer: p.footer, headerMedia: kind === 'list' ? undefined : p.headerMedia };
  const titles = p.kind === 'buttons' ? p.buttons.map((b) => b.title) : p.kind === 'list' ? p.sections.flatMap((s) => s.rows.map((r) => r.title)) : [];
  if (kind === 'buttons') {
    const t = (titles.length ? titles : ['', '']).slice(0, L.buttonsMax);
    return { ...base, kind, buttons: t.map((title) => ({ id: '', title })) };
  }
  if (kind === 'list') {
    const t = titles.length ? titles : ['', ''];
    return { ...base, kind, buttonText: 'Ver opções', sections: [{ rows: t.map((title) => ({ id: '', title })) }] };
  }
  return { ...base, kind, displayText: '', url: '' };
}

function Counter({ value, max }: { value: string | undefined; max: number }) {
  const n = [...(value ?? '')].length;
  return <span className={cn('text-[11px] tabular-nums', n > max ? 'text-destructive' : 'text-muted-foreground')}>{n}/{max}</span>;
}

const KINDS: Array<{ value: InteractiveKind; label: string; hint: string }> = [
  { value: 'buttons', label: 'Botões', hint: 'Até 3 opções' },
  { value: 'list', label: 'Lista', hint: 'Até 10 opções' },
  { value: 'cta_url', label: 'Link', hint: 'Um botão que abre um site' },
];

// Mídia no topo: mesmos tipos e tamanhos aceitos pela Meta.
const MEDIA_SPEC = {
  image: { label: 'Imagem', accept: 'image/jpeg,image/png', types: ['image/jpeg', 'image/png'], maxMb: 5, hint: 'JPG ou PNG até 5 MB' },
  video: { label: 'Vídeo', accept: 'video/mp4', types: ['video/mp4'], maxMb: 16, hint: 'MP4 até 16 MB' },
  document: { label: 'PDF', accept: 'application/pdf', types: ['application/pdf'], maxMb: 100, hint: 'PDF até 100 MB' },
} as const;
type TopKind = 'none' | 'text' | keyof typeof MEDIA_SPEC;

interface Props {
  value: InteractivePayload;
  onChange: (next: InteractivePayload) => void;
  problems?: string[];
  /** Necessário para subir imagem, vídeo ou PDF do topo. */
  organizationId?: string | null;
}

export function InteractiveEditor({ value, onChange, problems = [], organizationId }: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<InteractivePayload>) => onChange({ ...value, ...patch } as InteractivePayload);
  const top: TopKind = value.headerMedia ? value.headerMedia.type : value.header !== undefined ? 'text' : 'none';
  const allowsMedia = value.kind !== 'list';
  const setTop = (k: TopKind) => {
    if (k === 'none') set({ header: undefined, headerMedia: undefined });
    else if (k === 'text') set({ header: value.header ?? '', headerMedia: undefined });
    else set({ header: undefined, headerMedia: { type: k, url: value.headerMedia?.type === k ? value.headerMedia.url : '' } });
  };
  const uploadMedia = async (file: File | undefined) => {
    if (!file || !value.headerMedia || !organizationId) return;
    const spec = MEDIA_SPEC[value.headerMedia.type];
    if (!(spec.types as readonly string[]).includes(file.type) || file.size > spec.maxMb * 1024 * 1024) {
      toast({ variant: 'destructive', description: `Arquivo inválido: use ${spec.hint}.` });
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80) || 'arquivo';
      const path = `${organizationId}/interactive/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from('whatsapp-media').upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
      set({ headerMedia: { type: value.headerMedia.type, url: publicUrl, ...(value.headerMedia.type === 'document' ? { filename: file.name } : {}) } });
    } catch (e) {
      toast({ variant: 'destructive', description: `Falha ao enviar o arquivo: ${(e as Error).message}` });
    } finally {
      setUploading(false);
    }
  };
  const rows = value.kind === 'list' ? value.sections[0]?.rows ?? [] : [];

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_260px]">
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo">
          {KINDS.map((k) => (
            <Button key={k.value} type="button" size="sm" variant={value.kind === k.value ? 'default' : 'outline'}
              className="h-8 rounded-full px-3 text-xs" aria-pressed={value.kind === k.value} title={k.hint}
              onClick={() => onChange(switchKind(value, k.value))}>
              {k.label}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Topo da mensagem</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topo da mensagem">
            {(['none', 'text', ...(allowsMedia ? (['image', 'video', 'document'] as const) : [])] as TopKind[]).map((k) => (
              <Button key={k} type="button" size="sm" variant={top === k ? 'secondary' : 'ghost'} className="h-7 px-2.5 text-xs" aria-pressed={top === k} onClick={() => setTop(k)}>
                {k === 'none' ? 'Nada' : k === 'text' ? 'Título' : MEDIA_SPEC[k].label}
              </Button>
            ))}
          </div>
          {!allowsMedia && <p className="text-[11px] text-muted-foreground">Lista só aceita título em texto no topo.</p>}
          {top === 'text' && (
            <div className="flex items-center gap-2">
              <Input value={value.header ?? ''} placeholder="Título em negrito" onChange={(e) => set({ header: e.target.value })} />
              <Counter value={value.header} max={L.header} />
            </div>
          )}
          {value.headerMedia && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={uploading || !organizationId} asChild={!uploading && !!organizationId}>
                <label className="cursor-pointer">
                  <UploadSimple className="mr-1 h-4 w-4" />
                  {uploading ? 'Enviando…' : value.headerMedia.url ? 'Trocar arquivo' : 'Escolher arquivo'}
                  <input type="file" className="hidden" accept={MEDIA_SPEC[value.headerMedia.type].accept} onChange={(e) => { void uploadMedia(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </Button>
              <span className="text-[11px] text-muted-foreground">{value.headerMedia.url ? (value.headerMedia.filename || 'Arquivo pronto') : MEDIA_SPEC[value.headerMedia.type].hint}</span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between"><Label htmlFor="ix-body">Mensagem</Label><Counter value={value.body} max={L.body} /></div>
          <Textarea id="ix-body" rows={3} value={value.body} onChange={(e) => set({ body: e.target.value })} placeholder="Ex.: O seu bebê já nasceu ou você está grávida?" />
        </div>

        {value.kind === 'buttons' && (
          <div className="space-y-2">
            <Label>Botões</Label>
            {value.buttons.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={b.title} placeholder={`Botão ${i + 1}`} onChange={(e) => set({ buttons: value.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <Counter value={b.title} max={L.buttonTitle} />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Remover botão ${i + 1}`} disabled={value.buttons.length <= 1}
                  onClick={() => set({ buttons: value.buttons.filter((_, j) => j !== i) })}><Trash className="h-4 w-4" /></Button>
              </div>
            ))}
            {value.buttons.length < L.buttonsMax && (
              <Button type="button" variant="outline" size="sm" onClick={() => set({ buttons: [...value.buttons, { id: '', title: '' }] })}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar botão
              </Button>
            )}
          </div>
        )}

        {value.kind === 'list' && (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between"><Label htmlFor="ix-btn">Texto do botão que abre a lista</Label><Counter value={value.buttonText} max={L.listButtonText} /></div>
              <Input id="ix-btn" value={value.buttonText} onChange={(e) => set({ buttonText: e.target.value })} />
            </div>
            <Label>Opções</Label>
            {rows.map((r, i) => (
              <div key={i} className="space-y-1 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Input value={r.title} placeholder={`Opção ${i + 1}`} onChange={(e) => set({ sections: [{ ...value.sections[0], rows: rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }] })} />
                  <Counter value={r.title} max={L.rowTitle} />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Remover opção ${i + 1}`} disabled={rows.length <= 1}
                    onClick={() => set({ sections: [{ ...value.sections[0], rows: rows.filter((_, j) => j !== i) }] })}><Trash className="h-4 w-4" /></Button>
                </div>
                <Input value={r.description ?? ''} placeholder="Descrição (opcional)" className="h-8 text-xs"
                  onChange={(e) => set({ sections: [{ ...value.sections[0], rows: rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) }] })} />
              </div>
            ))}
            {rows.length < L.listRowsMax && (
              <Button type="button" variant="outline" size="sm" onClick={() => set({ sections: [{ ...value.sections[0], rows: [...rows, { id: '', title: '' }] }] })}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar opção
              </Button>
            )}
          </div>
        )}

        {value.kind === 'cta_url' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between"><Label htmlFor="ix-cta">Texto do botão</Label><Counter value={value.displayText} max={L.ctaDisplayText} /></div>
              <Input id="ix-cta" value={value.displayText} placeholder="Ex.: Ver contrato" onChange={(e) => set({ displayText: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ix-url">Link</Label>
              <Input id="ix-url" type="url" value={value.url} placeholder="https://" onChange={(e) => set({ url: e.target.value })} />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between"><Label htmlFor="ix-footer">Rodapé (opcional)</Label><Counter value={value.footer} max={L.footer} /></div>
          <Input id="ix-footer" value={value.footer ?? ''} onChange={(e) => set({ footer: e.target.value })} />
        </div>

        {problems.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive" aria-live="polite">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Prévia</span>
        <div className="rounded-lg bg-muted/50 p-3">
          <InteractiveMessageCard payload={value} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Botões e lista só podem ser enviados até 24 h depois da última mensagem da cliente. Em números que não usam a API oficial da Meta, a mensagem sai como texto numerado.
        </p>
      </div>
    </div>
  );
}
