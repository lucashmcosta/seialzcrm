-- Rollback de 20261018120000_process_classification_v1.sql.
-- ATENÇÃO: apaga classificações, versões de calibração e comissões gravadas pelo módulo.
-- Antes de rodar em produção, exporte as tabelas (são registro de comissão e auditoria).
BEGIN;
DROP TRIGGER IF EXISTS trg_pc_void_on_soft_delete ON public.opportunities;
DROP TRIGGER IF EXISTS trg_pc_void_on_delete ON public.opportunities;
DROP FUNCTION IF EXISTS public.fn_pc_void_on_opportunity_delete();
DROP FUNCTION IF EXISTS public.pc_record_classification(uuid, uuid, uuid, text, uuid, text, jsonb, jsonb);
DROP TABLE IF EXISTS public.opportunity_commissions;
DROP TABLE IF EXISTS public.classification_outcomes;
DROP TABLE IF EXISTS public.classification_correction_requests;
DROP TABLE IF EXISTS public.process_classification_results;
DROP TABLE IF EXISTS public.process_classifications;
DROP TABLE IF EXISTS public.process_classification_settings;
DROP TABLE IF EXISTS public.classification_calibration_versions;
DROP FUNCTION IF EXISTS public.fn_ccv_immutable();
DROP FUNCTION IF EXISTS public.pc_can_view_classification(uuid, uuid);
DROP FUNCTION IF EXISTS public.pc_has_flag(uuid, text[]);
DROP FUNCTION IF EXISTS public.org_widget_enabled(uuid, text);
DROP FUNCTION IF EXISTS public.pc_user_perms(uuid, uuid);

-- rbac_full_perms como estava em 20261009033819
CREATE OR REPLACE FUNCTION public.rbac_full_perms() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object('dados', jsonb_build_object(
    'contatos', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","exportar":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'oportunidades', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","exportar":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'conversas_comerciais', '{"ver":"todos","editar":"todos","excluir":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'atendimentos', '{"ver":"todos","editar":"todos","excluir":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'chamadas', '{"ver":"todos","exportar":"todos"}'::jsonb,
    'tarefas', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","atribuir":"todos"}'::jsonb),
   'ferramentas', '{"tel_realizar":true,"tel_receber":true,"tel_transferir":true,"rodizio":true,"wa_enviar":true,"wa_ativa":true,"importar":true,"marketing":true,"relatorios":true,"ia":true}'::jsonb,
   'administracao', '{"usuarios":true,"config":true,"distribuicao":true,"config_atendimento":true,"integracoes":true,"telefonia":true,"cobranca":true,"auditoria":true}'::jsonb)
$$;
COMMIT;
