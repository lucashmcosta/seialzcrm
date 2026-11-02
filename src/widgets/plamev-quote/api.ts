import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Estado { id: string; nome: string; uf: string }
export interface Cidade { id: string; nome: string }
export interface Raca { id: string; nome: string; porte: string }
export interface Plano {
  id: string; nome: string; tipoId: string; tipoNome: string; especie: string; origem: string;
  maisVendido: boolean; reembolso: boolean; coparticipativo: boolean;
  fidelidadeMeses: number | null; procedimentos: number | null; boleto: number; cartao: number;
}
export interface Campanha { id: string; nome: string; tabelas: { id: string; nome: string; tipo: string }[] }
export interface Linha { nome: string; valor: number }
export interface Resultado {
  mensalidade: number; totalMensalidade: number; descontosMensalidade: number; adesao: number;
  fidelidadeAte: string | null; composicaoMensalidade: Linha[]; composicaoAdesao: Linha[];
  numeroCotacao?: string; cotacaoId?: string;
}

export interface PetPedido {
  nome: string; especie: '1' | '2'; sexo: 'M' | 'F' | null; raca_id: string; nascimento: string; cobertura_id: string;
}
export interface PedidoSimulacao {
  estado_id: string; forma_pagamento: 1 | 2; origem: string; pets: PetPedido[];
  campanha: { id: string; tabela_id: string } | null; cupom: string | null;
}
export interface ClientePedido {
  nome: string; cpf: string; email: string; telefone: string; cep: string; logradouro: string;
  numero: string; complemento: string; bairro: string; cidade_id: string;
}

const MENSAGENS: Record<string, string> = {
  module_disabled: 'O widget da Plamev está desligado nesta organização.',
  plamev_not_configured: 'Falta o token da Plamev. Peça a um administrador para colar em Configurações › Widgets › Cotação Plamev.',
  plamev_unauthorized: 'A Plamev recusou o token salvo. Um administrador precisa colar um token novo nas configurações do widget.',
  token_rejected: 'A Plamev recusou este token. Gere um novo no portal da Plamev e tente de novo.',
  invalid_token: 'Isso não parece um token da Plamev. Cole só o token, sem espaços.',
  can_manage_settings_required: 'Você não tem permissão para configurar este widget.',
  missing_sexo: 'Escolha o sexo de cada pet para gravar a cotação.',
  invalid_cpf: 'CPF inválido. Confira os números.',
  invalid_email: 'E-mail inválido.',
  invalid_telefone: 'Telefone inválido. Use DDD + número.',
  invalid_cep: 'CEP inválido. Use os 8 números.',
  plamev_unavailable: 'A Plamev não respondeu. Tente de novo.',
};

export async function chamar<T>(organizationId: string, action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('plamev-quote', {
    body: { action, organization_id: organizationId, ...payload },
  });
  if (error) {
    let corpo: { error?: string; message?: string } | null = null;
    try { corpo = await (error as { context?: Response }).context?.json?.(); } catch { /* sem corpo */ }
    throw new Error(MENSAGENS[corpo?.error ?? ''] ?? corpo?.message ?? 'Falha ao falar com a Plamev.');
  }
  return data as T;
}

const HORA = 60 * 60 * 1000;

export function useEstados(org: string | undefined) {
  return useQuery({
    queryKey: ['plamev', org, 'estados'], enabled: !!org, staleTime: HORA,
    queryFn: () => chamar<{ estados: Estado[] }>(org!, 'estados').then((r) => r.estados),
  });
}

export function useCidades(org: string | undefined, estadoId: string, ativo: boolean) {
  return useQuery({
    queryKey: ['plamev', org, 'cidades', estadoId], enabled: !!org && !!estadoId && ativo, staleTime: HORA,
    queryFn: () => chamar<{ cidades: Cidade[] }>(org!, 'cidades', { estado_id: estadoId }).then((r) => r.cidades),
  });
}

export function useRacas(org: string | undefined, especie: '1' | '2') {
  return useQuery({
    queryKey: ['plamev', org, 'racas', especie], enabled: !!org, staleTime: HORA,
    queryFn: () => chamar<{ racas: Raca[] }>(org!, 'racas', { especie }).then((r) => r.racas),
  });
}

export function usePlanos(org: string | undefined, estadoId: string) {
  return useQuery({
    queryKey: ['plamev', org, 'planos', estadoId], enabled: !!org && !!estadoId, staleTime: HORA,
    queryFn: () => chamar<{ planos: Plano[] }>(org!, 'planos', { estado_id: estadoId }).then((r) => r.planos),
  });
}

export function useCampanhas(org: string | undefined, estadoId: string, tipoId: string | null) {
  return useQuery({
    queryKey: ['plamev', org, 'campanhas', estadoId, tipoId], enabled: !!org && !!estadoId && !!tipoId, staleTime: HORA,
    queryFn: () => chamar<{ campanhas: Campanha[] }>(org!, 'campanhas', { estado_id: estadoId, tipo_id: tipoId })
      .then((r) => r.campanhas),
  });
}

/** Simula sempre que o pedido muda (pedido null = incompleto, não chama). */
export function useSimulacao(org: string | undefined, pedido: PedidoSimulacao | null) {
  return useQuery({
    queryKey: ['plamev', org, 'simular', pedido], enabled: !!org && !!pedido, staleTime: 5 * 60 * 1000, retry: false,
    queryFn: () => chamar<{ resultado: Resultado }>(org!, 'simular', pedido!).then((r) => r.resultado),
  });
}
