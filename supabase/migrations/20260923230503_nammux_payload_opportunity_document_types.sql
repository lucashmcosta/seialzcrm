-- Versiona a correcao de `fn_build_opportunity_won_payload` que JA ESTA ATIVA
-- em producao desde 2026-09-23 22:21 UTC.
--
-- O QUE FOI CORRIGIDO
-- O CTE `att` sempre listou anexos dos dois lados (contact do contato e
-- opportunity da propria oportunidade), mas o CTE `subs` — unico lugar que
-- carrega `document_type_code` — cobria apenas `contact`/`contact_document`.
-- Resultado: anexo de oportunidade com `documents.document_type_id` valido
-- chegava ao Nammux com `document_type_code: null`, e o documento nascia sem
-- tipo. A correcao alinha o escopo de `subs` ao que `att` ja fazia.
--
-- HONESTIDADE SOBRE A ORIGEM
-- A correcao foi aplicada DIRETAMENTE EM PRODUCAO em 23/09/2026, fora do fluxo
-- de migrations, para estancar a perda de tipo documental no fluxo vivo. Esta
-- migration NAO foi a origem da mudanca: ela codifica/versiona no repositorio o
-- estado que ja esta ativo. Em producao e semanticamente NO-OP; em bancos novos
-- ou ambientes futuros, garante a definicao canonica.
--
-- VALIDACAO JA FEITA (23/09/2026, contra producao)
--   * 424 anexos de opportunity com tipo; 424/424 resolvem em document_types;
--   * 0 orfaos e 0 tipos deletados;
--   * comportamento de contact/contact_document preservado (0 regressoes);
--   * delta exato = os 424 anexos de opportunity;
--   * 0 duplicidade no array de submissions;
--   * `attachment_id` continua sendo `documents.id`.
--
-- `create or replace function` e idempotente por natureza: reaplicar nao muda
-- nada. Assinatura, SECURITY DEFINER, volatilidade e search_path preservados;
-- nenhum grant e alterado (a ACL atual permanece).

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
  )
  select jsonb_build_object(
    'schema_version', 2, 'event_version', '2.0', 'source', 'seialz_crm', 'organization_id', op.organization_id,
    'opportunity', jsonb_build_object('id', op.id, 'title', op.title, 'amount', op.amount, 'currency', op.currency,
      'status', op.status, 'pipeline_stage_id', op.pipeline_stage_id, 'close_date', op.close_date, 'owner_user_id', op.owner_user_id),
    'contact', contact_payload.value,
    'attachments', coalesce((select jsonb_agg(to_jsonb(att.*) order by att.created_at) from att), '[]'::jsonb),
    'document_submissions', coalesce((select jsonb_agg(to_jsonb(subs.*)) from subs), '[]'::jsonb)
  ) from op, contact_payload;
$function$;
