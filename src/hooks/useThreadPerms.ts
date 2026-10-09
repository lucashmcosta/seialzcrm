import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { usePermissions, permAt } from './usePermissions';
import type { Scope } from '@/lib/permissions/types';

export interface ThreadLike {
  assigned_user_id?: string | null;
  business_context?: string | null;
}

export const DENY_CLOSE = 'Seu perfil não permite resolver esta conversa.';
export const DENY_ASSIGN = 'Seu perfil não permite reatribuir esta conversa.';

/**
 * Antecipação na tela das regras do servidor (o servidor continua decidindo).
 * Com o modelo novo desligado, libera tudo, como antes.
 */
export function useThreadPerms(thread: ThreadLike | null | undefined) {
  const { permissions } = usePermissions();
  const { organization, userProfile } = useOrganization();
  const me = userProfile?.id ?? null;

  const { data: teamIds = [] } = useQuery({
    queryKey: ['my_team_user_ids', organization?.id, me],
    enabled: !!permissions.rbacV2 && !!organization?.id && !!me,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await supabase.rpc('my_team_user_ids', { _org: organization!.id });
      return (data as string[] | null) ?? [];
    },
  });

  if (!permissions.rbacV2 || !thread) return { canClose: true, canAssign: true };

  const obj = (thread.business_context ?? 'sales') === 'customer_service' ? 'atendimentos' : 'conversas_comerciais';
  const flag = permAt(permissions.v2, `dados.${obj}.sem_responsavel`) === true;
  const owner = thread.assigned_user_id ?? null;

  const allowed = (action: 'excluir' | 'atribuir') => {
    const s = permAt(permissions.v2, `dados.${obj}.${action}`) as Scope | undefined;
    if (!s || s === 'nenhum') return false;
    if (s === 'todos') return true;
    if (!owner) return flag;
    if (owner === me) return true;
    return s === 'equipe' && teamIds.includes(owner);
  };
  return { canClose: allowed('excluir'), canAssign: allowed('atribuir') };
}
