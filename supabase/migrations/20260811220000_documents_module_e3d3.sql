-- Etapa 3d-3: snapshot de fechamento. Ao GANHAR (stage.type='won' ou status='won'), grava
-- 1 linha com a avaliação de fechamento e QUAIS documentos satisfizeram cada exigência
-- (id + tipo + nome real) — auditoria/rastreabilidade (inclusive p/ o que segue ao Nammux).
-- Não-bloqueante: falha no snapshot NUNCA impede o ganho. Reversível (DOWN em rollback/).

create table if not exists public.opportunity_close_snapshots (
  opportunity_id  uuid primary key references public.opportunities(id) on delete cascade,
  organization_id uuid not null,
  contact_id      uuid,
  closed_at       timestamptz not null default now(),
  mode            text,
  policy_version  int,
  evaluation      jsonb not null,
  documents       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_opp_close_snapshots_org on public.opportunity_close_snapshots(organization_id);

alter table public.opportunity_close_snapshots enable row level security;
-- Leitura p/ membros da org; escrita só pela trigger (security definer).
drop policy if exists opp_close_snapshots_select on public.opportunity_close_snapshots;
create policy opp_close_snapshots_select on public.opportunity_close_snapshots
  for select using (public.user_has_org_access(organization_id));

create or replace function public.fn_snapshot_opportunity_close_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_target_type text; v_old_type text; v_is_won boolean;
  v_eval jsonb; v_docs jsonb; v_item jsonb; v_owner text; v_owner_id uuid; v_type_ids uuid[]; v_sat jsonb;
begin
  -- Detecta transição para GANHO (mesma semântica do guard).
  select type::text into v_target_type from public.pipeline_stages
   where id = new.pipeline_stage_id and organization_id = new.organization_id;
  v_is_won := (v_target_type = 'won' or new.status::text = 'won');
  if not v_is_won then return new; end if;
  if tg_op = 'UPDATE' then
    select type::text into v_old_type from public.pipeline_stages where id = old.pipeline_stage_id;
    if v_old_type = 'won' and old.status::text = 'won' then return new; end if; -- já era ganho
  end if;

  -- Snapshot NUNCA bloqueia o fechamento.
  begin
    v_eval := public.evaluate_opportunity_close_internal_v1(new.organization_id, new.id);
    v_docs := '[]'::jsonb;
    for v_item in
      select value from jsonb_array_elements(coalesce(v_eval->'items','[]'::jsonb)) as t(value)
      where value->>'action' = 'edit_documents'
    loop
      v_owner := v_item->>'owner_type';
      v_owner_id := case when v_owner = 'opportunity' then new.id else new.contact_id end;
      v_type_ids := array(select (jsonb_array_elements_text(coalesce(v_item->'document_type_ids','[]'::jsonb)))::uuid);
      select coalesce(jsonb_agg(jsonb_build_object(
               'document_id', d.id,
               'document_type_id', d.document_type_id,
               'display_name', coalesce(d.display_name, d.original_file_name, d.file_name)
             )), '[]'::jsonb)
        into v_sat
        from public.documents d
       where d.organization_id = new.organization_id and d.entity_type = v_owner
         and d.entity_id = v_owner_id and d.document_type_id = any(v_type_ids)
         and d.deleted_at is null and d.superseded_by_id is null and not coalesce(d.is_incomplete,false);
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'code', v_item->>'code',
        'label', v_item->>'label',
        'owner_type', v_owner,
        'document_type_ids', v_item->'document_type_ids',
        'status', v_item->>'status',
        'satisfied_by', v_sat
      ));
    end loop;

    insert into public.opportunity_close_snapshots(
      opportunity_id, organization_id, contact_id, closed_at, mode, policy_version, evaluation, documents, updated_at
    ) values (
      new.id, new.organization_id, new.contact_id, now(),
      v_eval->>'mode', coalesce((v_eval->>'policy_version')::int, 0), v_eval, v_docs, now()
    )
    on conflict (opportunity_id) do update set
      contact_id     = excluded.contact_id,
      closed_at      = excluded.closed_at,
      mode           = excluded.mode,
      policy_version = excluded.policy_version,
      evaluation     = excluded.evaluation,
      documents      = excluded.documents,
      updated_at     = now();
  exception when others then
    null; -- ignora qualquer erro do snapshot
  end;

  return new;
end;
$function$;

drop trigger if exists trg_snapshot_opportunity_close_v1 on public.opportunities;
create trigger trg_snapshot_opportunity_close_v1
  after insert or update of pipeline_stage_id, status on public.opportunities
  for each row execute function public.fn_snapshot_opportunity_close_v1();
