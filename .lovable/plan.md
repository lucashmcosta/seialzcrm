# Ajuste da regra de visibilidade do wrapper `get_home_dashboard_stats`

Só o wrapper muda. O core, a UI, RLS, policies, grants e índices ficam intocados.

## Por que o ajuste está certo

A checagem canônica que a tela `/dashboard` usa hoje **não** é `user_can_view_all()`. É o flag `view_all_opportunities` do perfil de permissão, lido por `usePermissions` (`user_organizations.permission_profile_id` → `permission_profiles.permissions`), e usado como `canViewAll` em `Dashboard.tsx`.

`user_can_view_all()` tem um atalho a mais: se `organizations.private_records_enabled` não for `true`, ela retorna `true` para **qualquer** usuário. O frontend nunca consulta esse campo. Logo, usar `user_can_view_all()` no wrapper poderia liberar dados de toda a organização para um usuário que hoje vê só os próprios — exatamente o risco apontado.

O wrapper passa a ler o mesmo flag de perfil, direto, sem o atalho de `private_records_enabled`. Isso também **melhora a paridade** com o legado, porque replica literalmente o critério do frontend.

## Fluxo do wrapper

1. validar identidade (`current_user_id()`);
2. validar membership ativo em `user_organizations`;
3. resolver `v_is_admin` **uma única vez**, pelo flag `view_all_opportunities` do perfil de permissão daquela org;
4. Admin → respeita `p_owner_user_id`, ou todos quando nulo;
5. não Admin → ignora qualquer `p_owner_user_id` recebido e força `owner_user_id = current_user_id()`.

## SQL ajustado (somente o wrapper)

```sql
CREATE OR REPLACE FUNCTION public.get_home_dashboard_stats(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_from_day        date,
  p_to_day          date,
  p_owner_user_id   uuid DEFAULT NULL,
  p_tz              text DEFAULT 'America/Sao_Paulo'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id  uuid;
  v_is_admin boolean;
  v_result   json;
BEGIN
  -- 1. identidade
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  -- 2. membership ativo na organização
  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id
      AND uo.user_id = v_user_id
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  -- 3. isAdmin resolvido UMA vez — mesmo critério que a tela usa hoje
  --    (view_all_opportunities no perfil de permissão da org).
  --    NÃO usa user_can_view_all(): ela retorna true para todos quando
  --    organizations.private_records_enabled não é true.
  SELECT COALESCE((pp.permissions ->> 'view_all_opportunities')::boolean, false)
  INTO v_is_admin
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.user_id = v_user_id
    AND uo.organization_id = p_organization_id
    AND uo.is_active = true
  LIMIT 1;

  v_is_admin := COALESCE(v_is_admin, false);

  -- 4/5. Admin respeita p_owner_user_id; não Admin é forçado ao próprio usuário.
  SELECT public.get_home_dashboard_stats_core(
           p_organization_id,
           p_from,
           p_to,
           p_from_day,
           p_to_day,
           CASE WHEN v_is_admin THEN p_owner_user_id ELSE NULL END,
           v_is_admin,
           v_user_id,
           COALESCE(NULLIF(p_tz, ''), 'America/Sao_Paulo')
         )
  INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_home_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_home_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_home_dashboard_stats(uuid, timestamptz, timestamptz, date, date, uuid, text) TO authenticated;
```

O core continua recebendo `p_view_all` (o `v_is_admin` resolvido) e `p_self_user_id`, e já força o próprio usuário quando `p_view_all` é falso — ou seja, mesmo que alguém chamasse o core com um owner arbitrário, o escopo não vazaria. Nenhuma linha do core, da UI, de RLS, policy ou grant de tabela é alterada.

## Depois disso

Segue o plano de shadow já aprovado: hook `useHomeDashboardStatsShadow` inerte sem modo parity, instrumentação passiva em `Dashboard.tsx`, e validação de paridade nos 4 cenários (Admin 30/90/365 dias e usuário sem `view_all_opportunities` em 30 dias), com `RPC_CALL_COUNT = 1` e `RPC_DURATION_MS` registrados. Cutover só em etapa separada.
