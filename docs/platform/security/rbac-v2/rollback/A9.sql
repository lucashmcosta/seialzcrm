-- Rollback A9: volta a mostrar conversas sem responsável para todos na lista
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.rpc_list_message_threads(uuid,text,text[],uuid,boolean,timestamptz,uuid,integer,text,uuid[],uuid[])'::regprocedure) INTO d;
 d := replace(d, '(mt.assigned_user_id IS NULL AND user_has_cs_permission(p_organization_id, ''can_manage_cs_queue''))', 'mt.assigned_user_id IS NULL');
 EXECUTE d;
END $$;
