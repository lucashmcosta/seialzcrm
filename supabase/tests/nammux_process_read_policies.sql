\set ON_ERROR_STOP on

-- Leitura da agenda e das movimentações pela tela
-- (20261118190000_nammux_process_read_policies.sql).
-- Confere privilégio e política; não cria dado. Rodar contra banco local.

do $$
declare
  t text;
begin
  foreach t in array array['nammux_process_events', 'nammux_process_movements'] loop
    if not has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception 'FALHA: authenticated não lê %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert')
       or has_table_privilege('authenticated', 'public.' || t, 'update')
       or has_table_privilege('authenticated', 'public.' || t, 'delete') then
      raise exception 'FALHA: authenticated escreve em %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select') then
      raise exception 'FALHA: anon lê %', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'FALHA: RLS desligada em %', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t
          and cmd = 'SELECT' and roles = '{authenticated}'
          and qual like '%user_has_org_access(organization_id)%') <> 1 then
      raise exception 'FALHA: política de leitura por organização ausente em %', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT') then
      raise exception 'FALHA: política de escrita em %', t;
    end if;
  end loop;
  -- O financeiro continua fechado para a tela.
  if has_table_privilege('authenticated', 'public.nammux_process_finance', 'select') then
    raise exception 'FALHA: authenticated lê o financeiro';
  end if;
  raise notice 'nammux_process_read_policies: OK';
end $$;
