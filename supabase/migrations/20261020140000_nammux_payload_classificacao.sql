-- A classificação do vendedor viaja no payload do ganho.
--
-- Por que: depois do ganho, quem entrevista o cliente (hoje no Nammux) precisa
-- CONFERIR o que o vendedor declarou -- e a certificação é o que transforma a
-- comissão prevista em comissão verificada (`pc_record_certification`). Sem as
-- respostas do lado de lá, não há o que conferir.
--
-- Pode viajar aqui porque a classificação SEMPRE antecede o ganho: medido em
-- 20/10/2026 nas 12 últimas, o evento `opportunity.won` sai de 0 a 22 minutos
-- depois de o vendedor finalizar. Então não precisa de evento novo nem de fila
-- nova -- pega carona no que já existe.
--
-- Aditivo: quem não tem classificação ativa recebe `classification: null`, e
-- nenhum consumidor existente lê essa chave. `schema_version` continua 2:
-- acrescentar chave opcional não quebra quem já lê o payload.

create or replace function public.fn_build_opportunity_won_payload(_opportunity_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$

  with op as (select o.* from public.opportunities o where o.id = _opportunity_id),
  contact_payload as (select public.fn_build_nammux_contact_payload(op.contact_id) value from op),
  att as (
    select distinct on (a.id) a.id, a.entity_type, a.entity_id, a.bucket, a.storage_path,
      a.file_name, a.mime_type, a.size_bytes, a.uploaded_by_user_id, a.created_at
    from public.documents a, op
    where a.deleted_at is null and (
      (a.entity_type = 'opportunity' and a.entity_id = op.id)
      or (a.entity_type = 'contact' and a.entity_id = op.contact_id))
  ),
  subs as (
    select d.id, 'approved'::text as status, d.document_type_id, d.id as attachment_id,
      dt.code as document_type_code, dt.name as document_type_name,
      d.file_name, d.mime_type, d.size_bytes, d.bucket, d.storage_path
    from public.documents d
    cross join op
    join public.document_types dt
      on dt.id = d.document_type_id and dt.deleted_at is null
    where d.document_type_id is not null and d.deleted_at is null
      and ( (d.entity_type in ('contact', 'contact_document') and d.entity_id = op.contact_id)
         or (d.entity_type = 'opportunity'                    and d.entity_id = op.id) )
  ),
  -- Só a classificação ATIVA. `superseded` (substituída por correção liberada) e
  -- `voided` (oportunidade apagada) não são o que vale.
  cls as (
    select c.id, c.band, c.commission, c.in_review, c.motor_version,
           c.input, c.seller_user_id, c.created_at
      from public.process_classifications c, op
     where c.opportunity_id = op.id and c.status = 'active'
     limit 1
  )
  select jsonb_build_object(
    'schema_version', 2, 'event_version', '2.0', 'source', 'seialz_crm', 'organization_id', op.organization_id,
    'opportunity', jsonb_build_object('id', op.id, 'title', op.title, 'amount', op.amount, 'currency', op.currency,
      'status', op.status, 'pipeline_stage_id', op.pipeline_stage_id, 'close_date', op.close_date, 'owner_user_id', op.owner_user_id),
    'contact', contact_payload.value,
    'attachments', coalesce((select jsonb_agg(to_jsonb(att.*) order by att.created_at) from att), '[]'::jsonb),
    'document_submissions', coalesce((select jsonb_agg(to_jsonb(subs.*)) from subs), '[]'::jsonb),
    -- `respostas` é a Entrada canônica do motor: é exatamente o formato que o
    -- Nammux devolve em `classification.certified`, corrigido no que a entrevista
    -- mostrou. Não mandar score, chance nem calibração: o recálculo é no Seialz,
    -- com a mesma versão de calibração que o vendedor usou.
    'classification', (
      select jsonb_build_object(
        'id', cls.id,
        'faixa', cls.band,
        'comissao', cls.commission,
        'em_revisao', cls.in_review,
        'motor_version', cls.motor_version,
        'vendedor_user_id', cls.seller_user_id,
        'classificado_em', cls.created_at,
        'respostas', cls.input
      ) from cls
    )
  ) from op, contact_payload;
$function$;

comment on function public.fn_build_opportunity_won_payload(uuid) is
  'Payload do evento opportunity.won para o Nammux (schema_version 2). Inclui a '
  'classificação ativa do vendedor para a certificação pós-entrevista; null quando '
  'a oportunidade não foi classificada.';
