DO $$
DECLARE
  v_contact_id uuid := 'c487bd4e-8684-403c-8750-6b7edbea33c9';
  v_thread_id uuid;
BEGIN
  UPDATE public.contacts
  SET full_name = 'Junior Teste',
      first_name = 'Junior',
      lifecycle_stage = 'customer',
      deleted_at = NULL
  WHERE id = v_contact_id;

  INSERT INTO public.message_threads (organization_id, contact_id, channel, status, primary_endpoint_id, last_inbound_at, whatsapp_last_inbound_at)
  VALUES ('b246ef6f-6242-4011-a112-6d8783d2896a', v_contact_id, 'whatsapp', 'open', '672a0845-0930-4f97-be6f-7b0d9fb2107f', now(), now())
  RETURNING id INTO v_thread_id;

  INSERT INTO public.messages (organization_id, thread_id, direction, content, sent_at, endpoint_id, sender_type)
  VALUES
    ('b246ef6f-6242-4011-a112-6d8783d2896a', v_thread_id, 'inbound', 'Oi, tudo bem? Esse é um teste.', now() - interval '5 minutes', '672a0845-0930-4f97-be6f-7b0d9fb2107f', 'contact'),
    ('b246ef6f-6242-4011-a112-6d8783d2896a', v_thread_id, 'inbound', 'Pode me responder por aqui.', now() - interval '1 minute', '672a0845-0930-4f97-be6f-7b0d9fb2107f', 'contact');
END $$;