UPDATE message_threads t
SET last_inbound_at = (
  SELECT MAX(m.created_at) 
  FROM messages m 
  WHERE m.thread_id = t.id 
  AND m.direction = 'inbound'
)
WHERE t.last_inbound_at IS NULL
AND EXISTS (
  SELECT 1 FROM messages m 
  WHERE m.thread_id = t.id 
  AND m.direction = 'inbound'
);