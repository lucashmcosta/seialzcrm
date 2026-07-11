-- Habilita o recurso multi-WABA (adicionar outra WABA reusando os secrets já
-- cadastrados) e torna as feature flags legíveis por usuários AUTENTICADOS, para
-- que a UI "Adicionar WABA" apareça para quem gerencia integrações na org — e não
-- apenas para admin de plataforma. Escrita em feature_flags segue admin-only.
--
-- Contexto: o schema de multi-WABA (partial uniques em organization_integrations
-- — "M3") já estava aplicado em produção; faltava só ligar a flag e permitir a
-- leitura dela pelo cliente. Idempotente: seguro re-aplicar.

-- 1) Liga a flag meta_multi_waba globalmente.
update public.feature_flags
set is_enabled = true, organization_ids = '{}'::uuid[], updated_at = now()
where name = 'meta_multi_waba';

insert into public.feature_flags (name, description, is_enabled, organization_ids)
select 'meta_multi_waba',
       'Habilita a UI "Adicionar WABA" (múltiplas WABAs por integração/org).',
       true, '{}'::uuid[]
where not exists (select 1 from public.feature_flags where name = 'meta_multi_waba');

-- 2) Leitura de feature flags para qualquer usuário autenticado (só SELECT).
--    Escrita continua restrita a admin (policy "Admins can manage feature flags").
drop policy if exists "Authenticated can read feature flags" on public.feature_flags;
create policy "Authenticated can read feature flags"
  on public.feature_flags for select
  to authenticated
  using (true);
