-- ============================================================================
-- PROPOSTA (drift P0 #1) — dedup de triggers de auditoria
-- ============================================================================
-- ⚠️ NÃO APLICADA. Requer revisão + janela aprovada. Vive em docs/operations/
-- proposals/ (e não em supabase/migrations/) DE PROPÓSITO: o pipeline aplica
-- migrations automaticamente no push, e esta mudança deve ser executada de
-- forma deliberada. Ao aprovar, mover para migration com timestamp do dia.
--
-- Contexto (verificado no banco vivo em 2026-07-05):
--   contacts, opportunities e tasks têm CADA UMA 4 triggers AFTER chamando
--   audit_log_trigger():
--     - 3 granulares: audit_<t>_insert / audit_<t>_update / audit_<t>_delete
--     - 1 combinada:  <t>_audit_trigger (INS/UPD/DEL)
--   → toda operação grava DUAS linhas idênticas em audit_logs
--   → audit_logs = 292K linhas / 463 MB (maior objeto do banco)
--
-- Origem: as duas famílias foram criadas por migrations do repo com ~23min
-- de diferença em 2025-11-30 (20251130003348_* e 20251130005646_*).
--
-- Decisão desta proposta: MANTER a combinada (<t>_audit_trigger), DROPAR as
-- 9 granulares — conforme fix recomendado em operations/drift/2026-07-04.md.
--
-- Rollback: recriar granulares a partir de 20251130003348_* (mas não há
-- motivo: a combinada cobre INS/UPD/DEL com a mesma function).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PRÉ-CHECK (rodar antes; deve retornar 12 linhas = 4 por tabela)
-- ---------------------------------------------------------------------------
-- SELECT c.relname, t.tgname
-- FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
-- WHERE NOT t.tgisinternal
--   AND c.relname IN ('contacts','opportunities','tasks')
--   AND t.tgfoid = 'audit_log_trigger'::regproc
-- ORDER BY 1, 2;

BEGIN;

DROP TRIGGER IF EXISTS audit_contacts_insert       ON public.contacts;
DROP TRIGGER IF EXISTS audit_contacts_update       ON public.contacts;
DROP TRIGGER IF EXISTS audit_contacts_delete       ON public.contacts;

DROP TRIGGER IF EXISTS audit_opportunities_insert  ON public.opportunities;
DROP TRIGGER IF EXISTS audit_opportunities_update  ON public.opportunities;
DROP TRIGGER IF EXISTS audit_opportunities_delete  ON public.opportunities;

DROP TRIGGER IF EXISTS audit_tasks_insert          ON public.tasks;
DROP TRIGGER IF EXISTS audit_tasks_update          ON public.tasks;
DROP TRIGGER IF EXISTS audit_tasks_delete          ON public.tasks;

-- Validação in-transaction: deve sobrar exatamente 1 trigger de audit por
-- tabela (a combinada). Aborta a TX se não.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
    AND c.relname IN ('contacts','opportunities','tasks')
    AND t.tgfoid = 'audit_log_trigger'::regproc;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Esperava 3 triggers de audit restantes (1 por tabela), achei %', v_count;
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- PÓS-CHECK (dia seguinte): confirmar que audit_logs parou de duplicar
-- ---------------------------------------------------------------------------
-- SELECT record_id, action, count(*)
-- FROM audit_logs
-- WHERE created_at > now() - interval '1 hour'
-- GROUP BY record_id, action, date_trunc('second', created_at)
-- HAVING count(*) > 1
-- LIMIT 10;   -- deve retornar 0 linhas

-- ---------------------------------------------------------------------------
-- FASE 2 (SEPARADA — não incluir na mesma janela):
--   expurgo dos ~50% de linhas históricas duplicadas + VACUUM FULL ou
--   pg_repack de audit_logs (463 MB). Exige análise de retenção própria e
--   janela dedicada — audit_logs é escrita no hot path.
-- ---------------------------------------------------------------------------
