-- Reatribuir contatos/oportunidades de teste para Tamires e Victoria (round-robin manual)
DO $$
DECLARE
  v_tamires uuid := '36497cc4-5a24-46ad-8b80-718b5e1954b3';
  v_victoria uuid := '3ee6ef05-2987-488f-90f8-9b3511957170';
BEGIN
  -- João Teste Silva → Tamires
  UPDATE contacts SET owner_user_id = v_tamires
    WHERE full_name = 'João Teste Silva' AND is_sample = true;
  UPDATE opportunities SET owner_user_id = v_tamires
    WHERE title = 'Consultoria Trabalhista — João Teste' AND is_sample = true;

  -- Maria Teste Souza → Victoria
  UPDATE contacts SET owner_user_id = v_victoria
    WHERE full_name = 'Maria Teste Souza' AND is_sample = true;
  UPDATE opportunities SET owner_user_id = v_victoria
    WHERE title = 'Rescisão Indireta — Maria Teste' AND is_sample = true;

  -- Atualiza last_assigned_at no user_organizations (simula round-robin)
  UPDATE user_organizations SET last_assigned_at = now() - interval '1 minute'
    WHERE user_id = v_tamires AND organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
  UPDATE user_organizations SET last_assigned_at = now()
    WHERE user_id = v_victoria AND organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
END $$;