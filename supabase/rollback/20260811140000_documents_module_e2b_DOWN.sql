-- ROLLBACK Etapa 2b. Remove a RPC de versionamento. (Documentos já versionados
-- permanecem: o encadeamento superseded_by_id/version/root_document_id é dado,
-- não depende da função.)

begin;

drop function if exists public.replace_document_single_v1(uuid, text, text, text, text, text, bigint, uuid, text);

select pg_notify('pgrst', 'reload schema');
commit;
