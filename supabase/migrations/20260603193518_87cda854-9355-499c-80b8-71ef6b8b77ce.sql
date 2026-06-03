-- Backfill primary_endpoint_id usando o endpoint da mensagem mais recente do thread
UPDATE message_threads t
SET primary_endpoint_id = m.endpoint_id
FROM (
  SELECT DISTINCT ON (thread_id) thread_id, endpoint_id
  FROM messages
  WHERE endpoint_id IS NOT NULL
  ORDER BY thread_id, created_at DESC
) m
WHERE t.id = m.thread_id
  AND t.channel = 'whatsapp'
  AND t.primary_endpoint_id IS NULL;

-- Segunda passada: organizações com um único endpoint WhatsApp ativo elegível
UPDATE message_threads t
SET primary_endpoint_id = ep.id
FROM communication_endpoints ep
WHERE t.primary_endpoint_id IS NULL
  AND t.channel = 'whatsapp'
  AND ep.organization_id = t.organization_id
  AND ep.channel = 'whatsapp'
  AND ep.is_active = true
  AND ep.purpose IN ('customer_service','other')
  AND (
    SELECT count(*) FROM communication_endpoints ep2
    WHERE ep2.organization_id = t.organization_id
      AND ep2.channel = 'whatsapp'
      AND ep2.is_active = true
      AND ep2.purpose IN ('customer_service','other')
  ) = 1;