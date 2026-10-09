DO $$ DECLARE d text; n text; BEGIN
 SELECT pg_get_functiondef('public.rpc_list_message_threads(uuid,text,text[],uuid,boolean,timestamptz,uuid,integer,text,uuid[],uuid[])'::regprocedure) INTO d;
 n := replace(d,
   'AND (v_can_view_all_threads OR mt.assigned_user_id = v_user_id OR mt.assigned_user_id IS NULL)',
   'AND (v_can_view_all_threads OR mt.assigned_user_id = v_user_id OR (mt.assigned_user_id IS NULL AND user_has_cs_permission(p_organization_id, ''can_manage_cs_queue'')))');
 IF n = d THEN RAISE EXCEPTION 'A9: trecho esperado não encontrado'; END IF;
 EXECUTE n;
END $$;