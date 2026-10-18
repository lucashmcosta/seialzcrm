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
