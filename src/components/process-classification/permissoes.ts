import { permAt, type Permissions } from '@/hooks/usePermissions';

/**
 * Relatório de classificações (/classificacoes): só quem vê classificações de OUTRAS pessoas (escopo Equipe ou Todos;
 * o Admin tem Todos). O vendedor vê a própria classificação só no widget: faixa e comissão, nunca a escada de faixas,
 * versões ou números. Mesma regra do banco (pc_pode_ver_outros).
 */
export const podeVerRelatorioClassificacoes = (p: Permissions) => {
  const v = permAt(p.v2, 'dados.classificacoes.ver');
  return v === 'equipe' || v === 'todos';
};

/** Lista de pedidos de correção em aberto: quem decide os pedidos (Liberar correção). Mesma regra de pc_pending_corrections. */
export const podeLiberarCorrecao = (p: Permissions) => permAt(p.v2, 'ferramentas.liberar_correcao') === true;
