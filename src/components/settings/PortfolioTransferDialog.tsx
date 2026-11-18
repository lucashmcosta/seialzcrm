// Transferência da carteira de um usuário (ao desativar, ou depois para quem já saiu).
// Unidade = contato: cada contato vai inteiro, com a conversa e as oportunidades abertas dele.
// O banco faz em lotes (rpc_transfer_user_portfolio_v1); aqui chamamos até não restar nada, com progresso.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';

export interface PortfolioPerson { user_id: string; name: string }
interface Summary { contacts: number; threads: number; opportunities: number }
type Mode = 'single' | 'split' | 'none';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

export function PortfolioTransferDialog({
  open,
  organizationId,
  person,
  candidates,
  /** 'deactivate' = está desativando agora; 'transfer' = a pessoa já está inativa. */
  intent,
  onDeactivate,
  onClose,
  onFinished,
}: {
  open: boolean;
  organizationId: string;
  person: PortfolioPerson;
  candidates: PortfolioPerson[];
  intent: 'deactivate' | 'transfer';
  /** Desativa o usuário (só no intent 'deactivate'); deve lançar erro se falhar. */
  onDeactivate?: () => Promise<void>;
  onClose: () => void;
  onFinished: (message: string) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('single');
  const [single, setSingle] = useState<string>('');
  const [split, setSplit] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);

  const others = useMemo(() => candidates.filter((c) => c.user_id !== person.user_id), [candidates, person.user_id]);
  const total = summary ? summary.contacts + summary.threads + summary.opportunities : 0;

  useEffect(() => {
    if (!open) return;
    setSummary(null); setLoadError(null); setRunError(null); setProgress(0);
    setMode('single'); setSingle(''); setSplit([]);
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('rpc_user_portfolio_summary_v1' as never, {
        p_organization_id: organizationId, p_user_id: person.user_id,
      } as never);
      if (cancelled) return;
      if (error) { setLoadError('Não foi possível carregar a carteira.'); return; }
      setSummary(data as unknown as Summary);
    })();
    return () => { cancelled = true; };
  }, [open, organizationId, person.user_id]);

  const targets = mode === 'single' ? (single ? [single] : []) : mode === 'split' ? split : [];
  const canRun = total === 0 || mode === 'none' || (mode === 'single' ? !!single : split.length >= 2);

  const run = async (transfer: boolean) => {
    setRunning(true); setRunError(null);
    try {
      let moved = { contacts: 0, threads: 0, opportunities: 0 };
      if (transfer && total > 0) {
        let offset = 0;
        let remaining = total;
        for (let i = 0; i < 500 && remaining > 0; i++) {
          const { data, error } = await supabase.rpc('rpc_transfer_user_portfolio_v1' as never, {
            p_organization_id: organizationId, p_from_user: person.user_id, p_mode: mode,
            p_targets: targets, p_batch_size: 500, p_offset: offset,
          } as never);
          if (error) throw new Error(error.code === '42501' ? 'Só administradores podem transferir carteiras.' : 'A transferência parou no meio. O que já foi passado está salvo; tente de novo para continuar.');
          const r = data as unknown as { contacts: number; threads: number; opportunities: number; support_threads_to_queue: number; next_offset: number; remaining: number };
          moved = { contacts: moved.contacts + r.contacts, threads: moved.threads + r.threads + (r.support_threads_to_queue || 0), opportunities: moved.opportunities + r.opportunities };
          offset = r.next_offset;
          // Sem avanço = algo bloqueou; para em vez de repetir para sempre.
          if (r.remaining >= remaining && r.contacts + r.threads + r.opportunities + (r.support_threads_to_queue || 0) === 0) {
            throw new Error('A transferência não avançou. Tente de novo.');
          }
          remaining = r.remaining;
          setProgress(Math.round(((total - remaining) / total) * 100));
        }
      }
      if (intent === 'deactivate') await onDeactivate?.();
      const parts = [
        moved.contacts ? plural(moved.contacts, 'contato', 'contatos') : null,
        moved.threads ? plural(moved.threads, 'conversa', 'conversas') : null,
        moved.opportunities ? plural(moved.opportunities, 'oportunidade', 'oportunidades') : null,
      ].filter(Boolean).join(' · ');
      const head = intent === 'deactivate' ? `${person.name} desativado(a)` : 'Carteira transferida';
      onFinished(parts ? `${head} · ${parts} transferidos` : head);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Erro ao transferir.');
    } finally {
      setRunning(false);
    }
  };

  const toggleSplit = (id: string, on: boolean) =>
    setSplit((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !running) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Para quem vai a carteira de {person.name}?</DialogTitle>
          <DialogDescription>
            {summary === null && !loadError && 'Carregando...'}
            {loadError}
            {summary && (total === 0
              ? 'Não há contatos, conversas abertas nem oportunidades abertas com esta pessoa.'
              : `${plural(summary.contacts, 'contato', 'contatos')} · ${plural(summary.threads, 'conversa aberta', 'conversas abertas')} · ${plural(summary.opportunities, 'oportunidade aberta', 'oportunidades abertas')}`)}
          </DialogDescription>
        </DialogHeader>

        {summary && total > 0 && (
          <div className="space-y-4">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} disabled={running} className="gap-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-normal">
                  <RadioGroupItem value="single" /> Tudo para uma pessoa
                </Label>
                {mode === 'single' && (
                  <Select value={single} onValueChange={setSingle} disabled={running}>
                    <SelectTrigger className="ml-6 w-[calc(100%-1.5rem)]"><SelectValue placeholder="Escolha quem recebe" /></SelectTrigger>
                    <SelectContent>
                      {others.map((u) => <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-normal">
                  <RadioGroupItem value="split" /> Dividir igualmente
                </Label>
                {mode === 'split' && (
                  <div className="ml-6 max-h-48 space-y-1.5 overflow-y-auto no-scrollbar rounded-lg border p-2">
                    {others.map((u) => (
                      <label key={u.user_id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={split.includes(u.user_id)} onCheckedChange={(v) => toggleSplit(u.user_id, v === true)} disabled={running} />
                        {u.name}
                      </label>
                    ))}
                  </div>
                )}
                {mode === 'split' && split.length > 0 && summary.contacts > 0 && (
                  <p className="ml-6 text-xs text-muted-foreground">
                    {split.length < 2 ? 'Escolha pelo menos duas pessoas.' : `Cerca de ${plural(Math.ceil(summary.contacts / split.length), 'contato', 'contatos')} para cada.`}
                  </p>
                )}
              </div>
              <Label className="flex items-center gap-2 font-normal">
                <RadioGroupItem value="none" /> Deixar sem responsável (vai para a fila e a distribuição automática)
              </Label>
            </RadioGroup>

            <p className="text-xs text-muted-foreground">
              Cada contato vai inteiro, com a conversa e as oportunidades abertas dele. Ganhas, perdidas e encerradas não mudam.
            </p>

            {running && <Progress value={progress} />}
          </div>
        )}

        {runError && <p className="text-sm text-destructive">{runError}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={running} onClick={onClose}>Cancelar</Button>
          {intent === 'deactivate' && summary && total > 0 && (
            <Button variant="outline" disabled={running} onClick={() => run(false)}>Desativar sem transferir</Button>
          )}
          <Button disabled={running || !summary || !canRun} onClick={() => run(true)}>
            {running ? `Transferindo... ${progress}%`
              : intent === 'deactivate' ? (total > 0 ? 'Transferir e desativar' : 'Desativar')
              : 'Transferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
