-- Phase 2: Add denormalized columns to message_threads
ALTER TABLE message_threads 
  ADD COLUMN IF NOT EXISTS last_message_id uuid,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_content text,
  ADD COLUMN IF NOT EXISTS last_message_direction text;

-- Create the trigger function with fast path (INSERT) and slow path (UPDATE/DELETE)
CREATE OR REPLACE FUNCTION fn_update_thread_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_thread_id uuid;
  v_rec RECORD;
BEGIN
  -- Determine which thread to update
  IF TG_OP = 'DELETE' THEN
    v_thread_id := OLD.thread_id;
  ELSE
    v_thread_id := NEW.thread_id;
  END IF;

  -- FAST PATH: INSERT only
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    UPDATE message_threads
    SET
      last_message_id = NEW.id,
      last_message_at = NEW.sent_at,
      last_message_content = LEFT(NEW.content, 200),
      last_message_direction = NEW.direction,
      updated_at = now()
    WHERE id = v_thread_id
      AND (last_message_at IS NULL OR NEW.sent_at >= last_message_at);
    
    RETURN NEW;
  END IF;

  -- SLOW PATH: UPDATE or DELETE — recalculate from messages
  SELECT m.id, m.sent_at, m.content, m.direction
  INTO v_rec
  FROM messages m
  WHERE m.thread_id = v_thread_id
    AND m.deleted_at IS NULL
  ORDER BY m.sent_at DESC
  LIMIT 1;

  IF v_rec.id IS NOT NULL THEN
    UPDATE message_threads
    SET
      last_message_id = v_rec.id,
      last_message_at = v_rec.sent_at,
      last_message_content = LEFT(v_rec.content, 200),
      last_message_direction = v_rec.direction,
      updated_at = now()
    WHERE id = v_thread_id;
  ELSE
    UPDATE message_threads
    SET
      last_message_id = NULL,
      last_message_at = NULL,
      last_message_content = NULL,
      last_message_direction = NULL,
      updated_at = now()
    WHERE id = v_thread_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_update_thread_last_message ON messages;
CREATE TRIGGER trg_update_thread_last_message
AFTER INSERT OR UPDATE OR DELETE ON messages
FOR EACH ROW
EXECUTE FUNCTION fn_update_thread_last_message();