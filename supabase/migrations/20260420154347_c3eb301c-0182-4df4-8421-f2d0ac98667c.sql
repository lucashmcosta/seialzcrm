DO $$
DECLARE
  v_org uuid := '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
  v_user uuid := '5ee56e0e-c53c-49ce-a8fb-a04db00b6436';
  v_stage uuid := 'b2fca5f6-9fb6-422f-bfe3-7495dcccec55';
  v_contact1 uuid := gen_random_uuid();
  v_contact2 uuid := gen_random_uuid();
  v_thread1 uuid := gen_random_uuid();
  v_thread2 uuid := gen_random_uuid();
  v_msg1 uuid := gen_random_uuid();
  v_msg2 uuid := gen_random_uuid();
  v_msg3 uuid := gen_random_uuid();
  v_opp1 uuid := gen_random_uuid();
  v_opp2 uuid := gen_random_uuid();
BEGIN
  -- Contatos
  INSERT INTO contacts (id, organization_id, full_name, first_name, last_name, phone, email, lifecycle_stage, owner_user_id, source, is_sample)
  VALUES
    (v_contact1, v_org, 'João Teste Silva', 'João', 'Teste Silva', '+5511999990001', 'joao.teste@example.com', 'lead', v_user, 'teste', true),
    (v_contact2, v_org, 'Maria Teste Souza', 'Maria', 'Teste Souza', '+5511999990002', 'maria.teste@example.com', 'lead', v_user, 'teste', true);

  -- Threads
  INSERT INTO message_threads (id, organization_id, contact_id, channel, status, last_message_at, last_message_content, last_message_direction, last_inbound_at, whatsapp_last_inbound_at, updated_at)
  VALUES
    (v_thread1, v_org, v_contact1, 'whatsapp', 'open', now() - interval '2 minutes', 'Olá! Gostaria de saber mais sobre os serviços trabalhistas.', 'inbound', now() - interval '2 minutes', now() - interval '2 minutes', now() - interval '2 minutes'),
    (v_thread2, v_org, v_contact2, 'whatsapp', 'open', now() - interval '1 hour', 'Perfeito, obrigada pelo retorno!', 'inbound', now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour');

  -- Mensagens thread 1 (apenas inbound, sem leitura)
  INSERT INTO messages (id, organization_id, thread_id, direction, content, sent_at, sender_type, sender_name, is_sample)
  VALUES
    (v_msg1, v_org, v_thread1, 'inbound', 'Olá! Gostaria de saber mais sobre os serviços trabalhistas.', now() - interval '2 minutes', 'contact', 'João Teste Silva', true);

  -- Mensagens thread 2 (troca de mensagens)
  INSERT INTO messages (id, organization_id, thread_id, direction, content, sent_at, sender_type, sender_name, sender_user_id, is_sample)
  VALUES
    (v_msg2, v_org, v_thread2, 'inbound', 'Bom dia, vocês atendem causas de rescisão?', now() - interval '2 hours', 'contact', 'Maria Teste Souza', NULL, true),
    (v_msg3, v_org, v_thread2, 'outbound', 'Bom dia, Maria! Sim, atendemos. Pode me contar mais sobre o caso?', now() - interval '90 minutes', 'user', 'Atendente', v_user, true);

  -- Mensagem final inbound já registrada no last_message do thread2
  INSERT INTO messages (id, organization_id, thread_id, direction, content, sent_at, sender_type, sender_name, is_sample)
  VALUES
    (gen_random_uuid(), v_org, v_thread2, 'inbound', 'Perfeito, obrigada pelo retorno!', now() - interval '1 hour', 'contact', 'Maria Teste Souza', true);

  -- Oportunidades
  INSERT INTO opportunities (id, organization_id, title, contact_id, amount, currency, pipeline_stage_id, status, owner_user_id, source, is_sample, created_by)
  VALUES
    (v_opp1, v_org, 'Consultoria Trabalhista — João Teste', v_contact1, 2500, 'BRL', v_stage, 'open', v_user, 'teste', true, v_user),
    (v_opp2, v_org, 'Rescisão Indireta — Maria Teste', v_contact2, 4800, 'BRL', v_stage, 'open', v_user, 'teste', true, v_user);
END $$;