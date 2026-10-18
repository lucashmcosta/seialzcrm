import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Faixa = 'PRATA' | 'OURO' | 'TITANIO' | 'DIAMANTE';

export type EstadoClassificacao =
  | 'fechada_sem_classificacao' | 'fechada_classificada'
  | 'sem_classificacao' | 'classificada' | 'em_revisao' | 'pedido_pendente' | 'pedido_recusado' | 'correcao_liberada';

export interface Classificacao { id: string; faixa: Faixa | null; comissao: number; emRevisao: boolean; classificadoEm: string }

export interface EstadoWidget {
  estado: EstadoClassificacao;
  podeClassificar: boolean;
  classificacao: Classificacao | null;
  pedido: { status: 'pending' | 'released' | 'refused'; criadoEm: string; motivo: string | null } | null;
}

export class ClassificationApiError extends Error {
  constructor(public code: string, message: string, public status: number, public extra: Record<string, unknown> = {}) { super(message); }
}

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('process-classification', { body: { action, ...payload } });
  if (error) {
    let body: any = null;
    let status = 0;
    try { status = (error as any).context?.status ?? 0; body = await (error as any).context?.json?.(); } catch { /* sem corpo */ }
    throw new ClassificationApiError(body?.error ?? 'request_failed', body?.message ?? 'Não foi possível falar com o servidor. Tente de novo.', status, body ?? {});
  }
  return data as T;
}

export const classificationKey = (opportunityId: string) => ['process-classification', opportunityId] as const;

/** Estado do widget. 403 (sem acesso ou módulo desligado) → null: o card não aparece. */
export function useClassificationState(opportunityId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: classificationKey(opportunityId ?? ''),
    enabled: enabled && !!opportunityId,
    staleTime: 30_000,
    retry: (n, e) => !(e instanceof ClassificationApiError && e.status > 0 && e.status < 500) && n < 2,
    queryFn: async (): Promise<EstadoWidget | null> => {
      try {
        return await call<EstadoWidget>('get_state', { opportunity_id: opportunityId });
      } catch (e) {
        if (e instanceof ClassificationApiError && (e.status === 403 || e.status === 404)) return null;
        throw e;
      }
    },
  });
}

export function useClassify(opportunityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { entrada: Record<string, unknown>; idempotencyKey: string }) =>
      call<Classificacao>('classify', { opportunity_id: opportunityId, entrada: v.entrada, idempotency_key: v.idempotencyKey }),
    onSettled: () => qc.invalidateQueries({ queryKey: classificationKey(opportunityId) }),
  });
}
