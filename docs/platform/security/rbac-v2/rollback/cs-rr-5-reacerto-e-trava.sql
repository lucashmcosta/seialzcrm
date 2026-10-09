-- Desfaz o reacerto de 2026-10-09 (volta as 5 conversas para sem responsável)
UPDATE public.message_threads SET assigned_user_id = NULL,
  last_routing_decision = jsonb_build_object('action','auto_reassign','reason','Rollback reacerto','source','cs_round_robin')
WHERE id IN ('30803202-6580-46d9-b627-ef093e399370','62aff697-0ee3-4e5f-b34a-aae787064a4c','c54fa9e9-3972-41a7-a898-151b15c3ccf7','55d791ba-6f63-470c-b0d6-b10fa4e24e1f','910f6512-1362-4101-b270-3b280e4947d7');
-- Funções: reaplicar cs_round_robin_enable e trg_messages_smart_reopen de supabase/migrations do item 3/4 (antes da trava de lista vazia e do filtro to_user_id IS NOT NULL).
