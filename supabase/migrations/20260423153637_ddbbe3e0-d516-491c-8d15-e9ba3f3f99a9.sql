UPDATE subscriptions 
SET max_seats = 5 
WHERE organization_id = 'f677a500-6067-436e-aeda-300f7adc26ab';

-- Garantir registro em subscription_usage com contagem real
INSERT INTO subscription_usage (subscription_id, current_seat_count, last_calculated_at)
SELECT s.id, 
  (SELECT COUNT(*) FROM user_organizations WHERE organization_id = s.organization_id AND is_active = true),
  now()
FROM subscriptions s
WHERE s.organization_id = 'f677a500-6067-436e-aeda-300f7adc26ab'
ON CONFLICT (subscription_id) DO UPDATE SET
  current_seat_count = (SELECT COUNT(*) FROM user_organizations WHERE organization_id = 'f677a500-6067-436e-aeda-300f7adc26ab' AND is_active = true),
  last_calculated_at = now();