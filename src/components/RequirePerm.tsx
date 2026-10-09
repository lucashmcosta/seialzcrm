import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions, canV2 } from '@/hooks/usePermissions';

/** Caminho do modelo novo exigido por cada área. Só vale com rbac_v2 ligado. */
export const AREA_PERMS: Record<string, string> = {
  '/contacts': 'dados.contatos.ver',
  '/opportunities': 'dados.oportunidades.ver',
  '/tasks': 'dados.tarefas.ver',
  '/commercial': 'dados.conversas_comerciais.ver',
  '/inbox': 'dados.atendimentos.ver',
  '/dashboards': 'ferramentas.relatorios',
  '/marketing': 'ferramentas.marketing',
};

export function areaAllowed(perms: ReturnType<typeof usePermissions>['permissions'], href: string): boolean {
  const key = Object.keys(AREA_PERMS).find((k) => href === k || href.startsWith(k + '/'));
  return key ? canV2(perms, AREA_PERMS[key]) : true;
}

/** Bloqueio real de rota com o modelo novo. Com o interruptor desligado, não faz nada. */
export function RequirePerm({ path, children }: { path: string; children: ReactNode }) {
  const { permissions, loading } = usePermissions();
  if (loading) return null;
  if (!canV2(permissions, path)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
