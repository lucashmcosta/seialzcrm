-- ============================================================================
-- PROPOSTA (drift P1 #3) — reconciliar cron órfã scheduled-messages-cron
-- ============================================================================
-- ⚠️ NÃO APLICADA. Requer DECISÃO DE PRODUTO + revisão + janela. Fora de
-- supabase/migrations/ de propósito (pipeline auto-aplica no push).
--
-- Investigação (banco vivo, 2026-07-05):
--   * Function `scheduled-messages-cron`: existe no repo, deployada (v275),
--     auth service_role correta. Processa scheduled_messages status=pending
--     com scheduled_at <= now() e retry_count < 3, enviando via
--     _shared/dispatch-whatsapp-send.ts.
--   * Nenhum dos 15 jobs do pg_cron a invoca → ÓRFÃ confirmada.
--   * Produtor: tool `schedule_follow_up` do ai-agent-respond.
--   * Tabela scheduled_messages: 3 linhas, TODAS pending, criadas em
--     2026-01-15, com scheduled_at = 2025-01-20 09:00 (data no PASSADO —
--     provável ano errado gerado pelo agente). Nunca enviadas.
--   * Consequência atual: schedule_follow_up grava linhas que NUNCA são
--     enviadas — falha silenciosa da feature há ~6 meses.
--
-- ⚠️ RISCO SE APENAS RECRIAR O CRON: as 3 linhas pending têm
-- scheduled_at <= now() e retry_count < 3 → seriam enviadas IMEDIATAMENTE,
-- 6 meses atrasadas, para contatos reais. O Passo 0 abaixo é obrigatório
-- antes de qualquer reativação.
--
-- DECISÃO PENDENTE (founder):
--   Opção A — reativar a feature (Passos 0 + A1)
--   Opção B — aposentar a feature (Passo 0 + desligar a tool schedule_follow_up
--             no ai-agent-respond via PR; remover a function no futuro)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASSO 0 (obrigatório nas duas opções): neutralizar as 3 pendências velhas
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE public.scheduled_messages
SET status = 'cancelled'
WHERE status = 'pending'
  AND scheduled_at < now() - interval '7 days';

-- Validação: nenhuma pendência antiga restante
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.scheduled_messages
  WHERE status = 'pending' AND scheduled_at < now() - interval '7 days';
  IF v <> 0 THEN RAISE EXCEPTION 'Ainda restam % pendências antigas', v; END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- PASSO A1 (somente Opção A): criar o cron job — idempotente
-- Padrão idêntico aos demais jobs (net.http_post + service_role via Vault).
-- Frequência sugerida: 1 min (mensagens agendadas têm granularidade humana).
-- ---------------------------------------------------------------------------
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-messages-cron') THEN
--     PERFORM cron.schedule(
--       'scheduled-messages-cron',
--       '* * * * *',
--       $cron$
--       SELECT net.http_post(
--         url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/scheduled-messages-cron',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer ' || (SELECT get_internal_function_auth_token())
--         ),
--         body := '{}'::jsonb
--       );
--       $cron$
--     );
--   END IF;
-- END $$;
--
-- NOTA: confirmar o mecanismo exato de token dos jobs existentes antes de
-- aplicar (os demais usam net.http_post com Authorization do Vault —
-- copiar o padrão literal de um job vivo, ex.: intelligence-worker-30s).
-- [INCERTO] get_internal_function_auth_token() vs secret direto do Vault.

-- ---------------------------------------------------------------------------
-- PASSO B (somente Opção B): nada a fazer no banco além do Passo 0.
-- A aposentadoria é via PR: remover/desligar a tool schedule_follow_up em
-- ai-agent-respond e atualizar docs/modules/ai-agent/. A function deployada
-- pode ser removida do dashboard numa janela posterior.
-- ---------------------------------------------------------------------------
