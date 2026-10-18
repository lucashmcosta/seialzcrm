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
  /** Vendedor que classificou pode pedir correção agora. */
  podePedirCorrecao?: boolean;
  /** A classificação ativa é de quem está vendo (o vendedor que classificou). */
  doVendedor?: boolean;
  /** Gestor com "Liberar correção" e pedido pendente. */
  podeDecidir?: boolean;
  /** Respostas do vendedor (Entrada), só para quem decide o pedido de correção. */
  respostas?: Record<string, unknown> | null;
  /** Certificação pós-ganho, feita pelo Jurídico na tela do Nammux (via API); aqui só é exibida. */
  certificacao?: Certificacao | null;
}

export interface FaixaComissao { faixa: Faixa | null; comissao: number }
export interface Certificacao {
  resultado: 'reduced' | 'confirmed'; motivo: string; certificadoEm: string; origem: 'seialz' | 'nammux';
  original: FaixaComissao; final: FaixaComissao;
}


export class ClassificationApiError extends Error {
  constructor(public code: string, message: string, public status: number, public extra: Record<string, unknown> = {}) { super(message); }
}

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('process-classification', { body: { action, ...payload } });
  if (error) {
    let body: { error?: string; message?: string; [k: string]: unknown } | null = null;
    const ctx = (error as { context?: Response }).context;
    const status = ctx?.status ?? 0;
    try { body = await ctx?.json?.(); } catch { /* sem corpo */ }
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

export function useRequestCorrection(opportunityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call<{ criadoEm: string }>('request_correction', { opportunity_id: opportunityId }),
    onSettled: () => qc.invalidateQueries({ queryKey: classificationKey(opportunityId) }),
  });
}

export function useDecideCorrection(opportunityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { release: boolean; reason?: string }) =>
      call<{ status: string }>('decide_correction', { opportunity_id: opportunityId, release: v.release, reason: v.reason ?? null }),
    onSettled: () => qc.invalidateQueries({ queryKey: classificationKey(opportunityId) }),
  });
}

/**
 * Tabelas do módulo que ainda não estão no types.ts gerado (regenerar depois de aplicar as migrações e trocar
 * as chamadas por supabase.from tipado). Concentrado aqui para não espalhar casts.
 */
export function tabelaClassificacao(nome: 'classification_calibration_versions' | 'process_classification_settings') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(nome);
}
