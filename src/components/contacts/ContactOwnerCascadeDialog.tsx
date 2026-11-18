// Troca do responsável do contato (o principal) com a opção de passar junto a conversa e as
// oportunidades abertas. Usado nos Atalhos do Comercial e no cadastro completo do contato.
// Tudo numa transação no banco (rpc_change_contact_owner_v1), com as permissões de quem troca.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { uiText } from '@/lib/ui-locale';

interface Counts { threads: number; aiThreads: number; opportunities: number }

export function ContactOwnerCascadeDialog({
  open,
  contactId,
  newOwnerId,
  newOwnerName,
  /** 'change' = ainda vai trocar o contato; 'after' = o contato já foi salvo, falta decidir o resto. */
  mode = 'change',
  onDone,
  onCancel,
}: {
  open: boolean;
  contactId: string;
  newOwnerId: string | null;
  newOwnerName: string;
  mode?: 'change' | 'after';
  onDone: () => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [withThreads, setWithThreads] = useState(true);
  const [withOpps, setWithOpps] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWithThreads(true);
    setWithOpps(true);
    setCounts(null);
    let cancelled = false;
    (async () => {
      const [th, op] = await Promise.all([
        supabase.from('message_threads')
          .select('id, ai_agent_id, ai_agent_released_at, assigned_user_id, business_context, status')
          .eq('contact_id', contactId).is('merged_into_thread_id', null)
          .not('status', 'in', '("resolved","closed")'),
        supabase.from('opportunities').select('id, owner_user_id')
          .eq('contact_id', contactId).eq('status', 'open').is('deleted_at', null),
      ]);
      if (cancelled) return;
      const threads = ((th.data ?? []) as Array<{ ai_agent_id: string | null; ai_agent_released_at: string | null; assigned_user_id: string | null; business_context: string | null }>)
        .filter((t) => t.business_context !== 'customer_service' && t.assigned_user_id !== newOwnerId);
      const opps = ((op.data ?? []) as Array<{ owner_user_id: string | null }>).filter((o) => o.owner_user_id !== newOwnerId);
      setCounts({
        threads: threads.length,
        aiThreads: threads.filter((t) => t.ai_agent_id && !t.ai_agent_released_at && !t.assigned_user_id).length,
        opportunities: opps.length,
      });
    })();
    return () => { cancelled = true; };
  }, [open, contactId, newOwnerId]);

  const apply = async (cascade: boolean) => {
    setSaving(true);
    const { data, error } = await supabase.rpc('rpc_change_contact_owner_v1' as never, {
      p_contact_id: contactId,
      p_new_owner: newOwnerId,
      p_threads: cascade && withThreads,
      p_opportunities: cascade && withOpps,
    } as never);
    setSaving(false);
    if (error) {
      const msg = error.message || '';
      toast.error(msg.includes('forbidden') || error.code === '42501'
        ? uiText('Você não tem permissão para fazer esta troca.')
        : uiText('Não foi possível trocar o responsável.'));
      return;
    }
    const r = (data ?? {}) as { threads?: number; opportunities?: number };
    const extra = [
      r.threads ? (r.threads === 1 ? uiText('1 conversa') : `${r.threads} ${uiText('conversas')}`) : null,
      r.opportunities ? (r.opportunities === 1 ? uiText('1 oportunidade') : `${r.opportunities} ${uiText('oportunidades')}`) : null,
    ].filter(Boolean).join(' · ');
    toast.success(extra ? `${uiText('Responsável atualizado')} · ${extra}` : uiText('Responsável atualizado'));
    onDone();
  };

  const nothingElse = counts !== null && counts.threads === 0 && counts.opportunities === 0;
  // Nada mais para passar: troca direto, sem perguntar.
  useEffect(() => {
    if (!open || !nothingElse || saving) return;
    if (mode === 'after') onDone(); // o contato já foi salvo e não há mais nada para passar
    else void apply(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nothingElse]);
  if (nothingElse) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'after'
              ? uiText('Passar também a conversa e as oportunidades?')
              : `${uiText('Passar o contato para')} ${newOwnerName}?`}
          </DialogTitle>
          <DialogDescription>
            {uiText('O responsável do contato é o principal. Normalmente a conversa e as oportunidades abertas vão junto.')}
          </DialogDescription>
        </DialogHeader>

        {counts === null ? (
          <p className="text-sm text-muted-foreground">{uiText('Carregando...')}</p>
        ) : (
          <div className="space-y-3">
            {counts.threads > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={withThreads} onCheckedChange={(v) => setWithThreads(v === true)} className="mt-0.5" />
                <span>
                  {uiText('Também passar a conversa para')} {newOwnerName}
                  {counts.aiThreads > 0 && (
                    <span className="block text-xs text-amber-600 dark:text-amber-400">
                      {uiText('A IA está atendendo: passar para uma pessoa tira a IA da conversa.')}
                    </span>
                  )}
                </span>
              </label>
            )}
            {counts.opportunities > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={withOpps} onCheckedChange={(v) => setWithOpps(v === true)} className="mt-0.5" />
                <span>
                  {uiText('Também passar as oportunidades abertas para')} {newOwnerName} ({counts.opportunities})
                  <span className="block text-xs text-muted-foreground">{uiText('Ganhas e perdidas não mudam.')}</span>
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {mode === 'change' ? (
            <>
              <Button variant="outline" disabled={saving} onClick={onCancel}>{uiText('Cancelar')}</Button>
              <Button variant="outline" disabled={saving || counts === null} onClick={() => apply(false)}>{uiText('Só o contato')}</Button>
              <Button disabled={saving || counts === null} onClick={() => apply(true)}>{uiText('Confirmar')}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={saving} onClick={onCancel}>{uiText('Não, só o contato')}</Button>
              <Button disabled={saving || counts === null} onClick={() => apply(true)}>{uiText('Confirmar')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
