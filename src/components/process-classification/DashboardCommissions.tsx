import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Hourglass, SealCheck } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KpiCard } from '@/components/reports/KpiCard';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { NOME_FAIXA, formatarBRL } from './formato';
import type { Faixa } from './api';
import { useProcessClassificationEnabled } from './useProcessClassificationEnabled';

type Situacao = 'prevista' | 'confirmada';

interface Linha {
  oportunidadeId: string; oportunidade: string | null; contato: string | null; vendedor: string | null; ganhaEm: string;
  situacao: Situacao; faixa: Faixa | null; comissao: number;
  ajuste: { faixa: Faixa | null; comissao: number; motivo: string } | null;
}
interface Resumo {
  visivel: boolean; soMinhas?: boolean;
  prevista?: { total: number; quantidade: number }; confirmada?: { total: number; quantidade: number };
  linhas?: Linha[];
}

const nomeFaixa = (f: Faixa | null) => (f ? NOME_FAIXA[f] : 'Em revisão');
const vendas = (n: number) => `${n} ${n === 1 ? 'venda' : 'vendas'}`;
/** close_date é DATE: "2026-10-19" → "19/10/2026" sem passar por fuso. */
const dia = (s: string) => s.split('-').reverse().join('/');

const TITULO: Record<Situacao, string> = { prevista: 'Comissão prevista', confirmada: 'Comissão confirmada' };
const EXPLICA: Record<Situacao, string> = {
  prevista: 'Vendas ganhas no período que ainda aguardam a entrevista. O valor é o da classificação.',
  confirmada: 'Vendas ganhas no período com a entrevista feita. Vale o valor final da certificação.',
};

/**
 * Comissões no Início (widget Classificação do processo): vendas ganhas no período do filtro, em
 * "prevista" (aguardando a entrevista) e "confirmada" (certificada). Clicar abre a lista.
 * O servidor decide o escopo: quem só vê as próprias recebe as próprias, qualquer que seja `sellerId`.
 */
export function DashboardCommissions({ fromDay, toDay, sellerId }: { fromDay: string; toDay: string; sellerId: string | null }) {
  const { organization } = useOrganization();
  const enabled = useProcessClassificationEnabled();
  const navigate = useNavigate();
  const [aberta, setAberta] = useState<Situacao | null>(null);
  const org = organization?.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['pc-dashboard-commissions', org, fromDay, toDay, sellerId],
    enabled: !!org && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pc_dashboard_commissions' as never,
        { _org: org, _from: fromDay, _to: toDay, _seller: sellerId } as never);
      if (error) throw error;
      return data as unknown as Resumo;
    },
  });

  if (!enabled || (!isLoading && !data?.visivel)) return null;

  const cards: { s: Situacao; icon: typeof Hourglass; accent: 'warning' | 'success'; detalhe: string }[] = [
    { s: 'prevista', icon: Hourglass, accent: 'warning', detalhe: 'aguardando a entrevista' },
    { s: 'confirmada', icon: SealCheck, accent: 'success', detalhe: 'entrevista feita' },
  ];
  const linhas = (data?.linhas ?? []).filter((l) => l.situacao === aberta);

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Comissões</h2>
        <p className="text-xs text-muted-foreground">
          {data?.soMinhas === false ? 'Da equipe, nas vendas ganhas no período.' : 'Suas, nas vendas ganhas no período.'}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ s, icon, accent, detalhe }) => {
          const r = data?.[s];
          return (
            <KpiCard key={s} label={TITULO[s]} value={r ? formatarBRL(Number(r.total)) : '—'} icon={icon} accent={accent} mono
              loading={isLoading} sublabel={r ? `${vendas(r.quantidade)} · ${detalhe}` : undefined}
              onClick={r ? () => setAberta(s) : undefined} />
          );
        })}
      </div>

      <Dialog open={aberta !== null} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{aberta && `${TITULO[aberta]} — ${linhas.length}`}</DialogTitle>
            <DialogDescription>{aberta && EXPLICA[aberta]}</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto -mx-6 px-6">
            {linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem vendas no período.</p>
            ) : (
              <ul className="divide-y divide-border">
                {linhas.map((l) => (
                  <li key={l.oportunidadeId}>
                    <button type="button" onClick={() => { setAberta(null); navigate(`/opportunities/${l.oportunidadeId}`); }}
                      className="w-full flex items-start justify-between gap-4 py-3 text-left hover:bg-muted/50 px-2 rounded transition">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{l.contato || '(sem contato)'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.oportunidade || '(sem título)'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {`Ganha em ${dia(l.ganhaEm)} · ${nomeFaixa(l.faixa)}`}
                          {data?.soMinhas === false && l.vendedor ? ` · ${l.vendedor}` : ''}
                        </p>
                        {l.ajuste && (
                          <p className="text-xs text-destructive mt-0.5">
                            Ajustada na entrevista ({nomeFaixa(l.ajuste.faixa)} → {nomeFaixa(l.faixa)}): {l.ajuste.motivo}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-mono text-right flex-shrink-0">
                        {l.ajuste && <s className="block text-xs text-muted-foreground">{formatarBRL(Number(l.ajuste.comissao))}</s>}
                        {formatarBRL(Number(l.comissao))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
