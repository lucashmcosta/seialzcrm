// Prévia da régua no editor: escolhe uma oportunidade aberta e vê cada passo (rascunho) já preenchido.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { uiText } from '@/lib/ui-locale';

export interface PreviewStep {
  kind: string; template_id?: string | null; template_variables?: Record<string, string>; email_template_id?: string | null;
  task_title?: string; condition?: Record<string, unknown> | null;
}
interface PreviewResult { kind: string; subject?: string; text: string; missing: string[]; condition_ok: boolean | null }

const KIND: Record<string, string> = { whatsapp_template: 'WhatsApp', email: 'E-mail', task: 'Tarefa' };

export function CadencePreview({ organizationId, steps }: { organizationId: string; steps: PreviewStep[] }) {
  const [search, setSearch] = useState('');
  const [oppId, setOppId] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: opps } = useQuery({
    queryKey: ['cadence-preview-opps', organizationId, search],
    queryFn: async () => {
      let q = supabase.from('opportunities').select('id, title, contacts:contact_id(full_name)')
        .eq('organization_id', organizationId).eq('status', 'open').is('deleted_at', null)
        .order('updated_at', { ascending: false }).limit(6);
      if (search.trim()) q = q.ilike('title', `%${search.trim()}%`);
      const { data } = await q;
      return (data ?? []) as unknown as Array<{ id: string; title: string; contacts: { full_name: string | null } | null }>;
    },
  });

  const run = async (id: string) => {
    setOppId(id); setLoading(true); setError(null);
    const { data, error: err } = await supabase.functions.invoke('cadence-preview', { body: { organization_id: organizationId, opportunity_id: id, steps } });
    setLoading(false);
    if (err || !data?.ok) { setError(uiText('Não foi possível gerar a prévia.')); return; }
    setResult(data.steps as PreviewResult[]);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{uiText('Prévia')}</p>
      <p className="text-xs text-muted-foreground">{uiText('Escolha uma oportunidade aberta para ver os passos já preenchidos. Nada é enviado.')}</p>
      <Input className="h-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={uiText('Buscar oportunidade pelo título')} />
      <div className="flex flex-wrap gap-1">
        {(opps ?? []).map((o) => (
          <Button key={o.id} size="sm" variant={oppId === o.id ? 'default' : 'outline'} className="h-7 max-w-[220px] truncate text-xs" onClick={() => run(o.id)}>
            {o.contacts?.full_name || o.title}
          </Button>
        ))}
      </div>
      {loading && <p className="text-xs text-muted-foreground">{uiText('Gerando...')}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && !loading && (
        <div className="space-y-2">
          {result.map((r, i) => (
            <div key={i} className="rounded-md bg-muted/50 p-2 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium">{uiText('Passo')} {i + 1} · {uiText(KIND[r.kind] ?? r.kind)}</span>
                {r.condition_ok === true && <Badge variant="outline" className="text-[10px]">{uiText('condição bate agora')}</Badge>}
                {r.condition_ok === false && <Badge variant="outline" className="text-[10px]">{uiText('condição não bate: seria pulado')}</Badge>}
                {r.missing.length > 0 && <Badge variant="destructive" className="text-[10px]">{uiText('vazio')}: {r.missing.join(', ')}</Badge>}
              </div>
              {r.subject && <p className="font-medium">{r.subject}</p>}
              <p className="whitespace-pre-wrap">{r.text || '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
