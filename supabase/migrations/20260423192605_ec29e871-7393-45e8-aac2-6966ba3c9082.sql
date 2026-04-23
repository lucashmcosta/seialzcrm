-- 1) Garantir capacidade de assentos para a Central Trabalhista
UPDATE public.subscriptions
SET max_seats = GREATEST(COALESCE(max_seats, 0), 8),
    updated_at = now()
WHERE organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND COALESCE(max_seats, 0) < 8;

-- 2) Reativar os 3 usuários desativados
UPDATE public.user_organizations uo
SET is_active = true
FROM public.users u
WHERE uo.user_id = u.id
  AND uo.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND lower(u.email) IN (
    'lflandoli@centraltrabalhista.com.br',
    'lkim@centraltrabalhista.com.br',
    'csilva@centraltrabalhista.com.br'
  );

-- 3) Recalcular contagem de assentos ativos
UPDATE public.subscription_usage su
SET current_seat_count = (
      SELECT COUNT(*)
      FROM public.user_organizations uo
      WHERE uo.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
        AND uo.is_active = true
    ),
    last_calculated_at = now()
FROM public.subscriptions s
WHERE s.id = su.subscription_id
  AND s.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';