import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Calibracao } from './editor';

export class CalibracaoApiError extends Error {
  constructor(public code: string, message: string, public status: number, public extra: Record<string, unknown> = {}) { super(message); }
}

/** Chama a edge process-classification-admin (todo cálculo é no servidor). */
export async function callAdmin<T>(organizationId: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('process-classification-admin', { body: { action, organization_id: organizationId, ...payload } });
  if (error) {
    let body: { error?: string; message?: string; [k: string]: unknown } | null = null;
    const ctx = (error as { context?: Response }).context;
    try { body = await ctx?.json?.(); } catch { /* sem corpo */ }
    throw new CalibracaoApiError(body?.error ?? 'request_failed', body?.message ?? 'Não foi possível falar com o servidor.', ctx?.status ?? 0, body ?? {});
  }
  return data as T;
}

export interface ItemCatalogo { label: string; sub?: string; epi?: string; fora?: string }
export interface TeseCatalogo {
  nome: string; probs?: Record<string, ItemCatalogo>; valores?: Record<string, ItemCatalogo>;
  agentes?: Record<string, ItemCatalogo>; situacoes?: Record<string, ItemCatalogo>;
}
export interface Versao { id: string; numero: number; status: 'published' | 'archived'; nota: string | null; publicadaEm: string | null; publicadaPor: string | null; conteudo: Calibracao }
export interface Workspace {
  motorVersao: string; podeCalibrar: boolean; podePublicar: boolean; catalogo: Record<string, TeseCatalogo>;
  publicada: { id: string; numero: number; conteudo: Calibracao; nota: string | null; publicadaEm: string } | null;
  rascunho: { id: string; numero: number; conteudo: Calibracao; atualizadoEm: string } | null;
  historico: Versao[];
}
export interface Mudanca { caminho: string; rotulo: string; antes: unknown; depois: unknown }
export interface Conferencia { problemas: string[]; mudancas: Mudanca[]; matriz: { faixa: string; comissao: number; emRevisao: boolean }[][] }

export const workspaceKey = (org: string) => ['process-classification-workspace', org] as const;

export function useWorkspace(organizationId: string) {
  return useQuery({
    queryKey: workspaceKey(organizationId),
    queryFn: () => callAdmin<Workspace>(organizationId, 'workspace'),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useRecarregarWorkspace(organizationId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: workspaceKey(organizationId) });
}
