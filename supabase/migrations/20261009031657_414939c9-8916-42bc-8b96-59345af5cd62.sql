CREATE OR REPLACE FUNCTION public.fn_permissions_from_legacy(l jsonb, privacy_on boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  t boolean; vt text; flag boolean;
  ma boolean := COALESCE((l->>'manage_assignments')::boolean,false);
  ms boolean := COALESCE((l->>'can_manage_settings')::boolean,false);
  FUNCTION_DUMMY int;
BEGIN
  vt := CASE WHEN COALESCE((l->>'view_all_threads')::boolean,false) OR NOT privacy_on THEN 'todos' ELSE 'meus' END;
  flag := vt = 'todos' OR COALESCE((l->>'can_manage_cs_queue')::boolean,false);
  RETURN jsonb_build_object(
    'dados', jsonb_build_object(
      'contatos', public.fn__rec_from_legacy(l, 'contacts', privacy_on),
      'oportunidades', public.fn__rec_from_legacy(l, 'opportunities', privacy_on),
      'conversas_comerciais', jsonb_build_object('ver',vt,'editar',vt,'excluir',vt,
          'atribuir', CASE WHEN ma THEN vt ELSE 'nenhum' END, 'sem_responsavel', flag),
      'atendimentos', jsonb_build_object('ver',vt,'editar',vt,
          'excluir', CASE WHEN COALESCE((l->>'can_close_threads')::boolean,false) THEN vt ELSE 'nenhum' END,
          'atribuir', CASE WHEN COALESCE((l->>'can_takeover_thread')::boolean,false) OR COALESCE((l->>'can_escalate_thread')::boolean,false) THEN vt ELSE 'nenhum' END,
          'sem_responsavel', flag),
      'chamadas', jsonb_build_object('ver', CASE WHEN COALESCE((l->>'can_view_all_calls')::boolean,false) THEN 'todos' ELSE 'meus' END, 'exportar','nenhum'),
      'tarefas', jsonb_build_object('ver','todos','criar',true,'editar','todos','excluir','todos','atribuir','todos')),
    'ferramentas', jsonb_build_object(
      'tel_realizar', COALESCE((l->>'can_make_calls')::boolean,false),
      'tel_receber', COALESCE((l->>'can_receive_calls')::boolean,false),
      'tel_transferir', COALESCE((l->>'can_transfer_calls')::boolean,false),
      'rodizio', COALESCE((l->>'round_robin_recipient')::boolean,false),
      'wa_enviar', true,
      'wa_ativa', COALESCE((l->>'can_send_templates')::boolean,false),
      'importar', ms, 'marketing', ms, 'relatorios', ms, 'ia', true),
    'administracao', jsonb_build_object(
      'usuarios', COALESCE((l->>'can_manage_users')::boolean,false),
      'config', ms, 'distribuicao', ma,
      'config_atendimento', COALESCE((l->>'can_manage_support_settings')::boolean,false),
      'integracoes', COALESCE((l->>'can_manage_integrations')::boolean,false),
      'telefonia', COALESCE((l->>'can_manage_telephony')::boolean,false),
      'cobranca', COALESCE((l->>'can_manage_billing')::boolean,false),
      'auditoria', false));
END $$;