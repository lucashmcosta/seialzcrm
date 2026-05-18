WITH candidates AS (
  SELECT o.id,
    GREATEST(
      o.updated_at,
      COALESCE(
        (SELECT MAX(m.created_at)
         FROM messages m
         JOIN message_threads t ON t.id = m.thread_id
         WHERE t.contact_id = o.contact_id
           AND t.organization_id = o.organization_id),
        o.updated_at
      )
    ) AS new_close_date,
    (SELECT MAX(m.created_at)
     FROM messages m
     JOIN message_threads t ON t.id = m.thread_id
     WHERE t.contact_id = o.contact_id
       AND t.organization_id = o.organization_id) AS last_msg_at
  FROM opportunities o
  WHERE o.organization_id IN (
      'b246ef6f-6242-4011-a112-6d8783d2896a',
      '40ae935c-a7f7-4ad7-8ea4-91be6404a95f',
      'a4078c14-1fe5-405e-9a66-5efd9a41315c'
    )
    AND o.deleted_at IS NULL
    AND o.status NOT IN ('won','lost')
    AND o.created_at < now() - interval '15 days'
)
UPDATE public.opportunities o
SET status = 'lost',
    close_date = c.new_close_date::date,
    updated_at = now()
FROM candidates c
WHERE o.id = c.id
  AND COALESCE(c.last_msg_at, o.created_at) < now() - interval '15 days';