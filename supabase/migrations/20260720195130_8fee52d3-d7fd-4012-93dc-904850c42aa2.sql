
-- Phase 5 — Additive expansion of allowed messaging_lines.key values.
-- Existing rows keep working: `commercial` and `customer_service` remain valid.
-- New: `evolution_pilot` — reserved for the Viagi Evolution pilot line.
ALTER TABLE public.messaging_lines
  DROP CONSTRAINT IF EXISTS messaging_lines_key_check;

ALTER TABLE public.messaging_lines
  ADD CONSTRAINT messaging_lines_key_check
  CHECK (key = ANY (ARRAY['commercial'::text, 'customer_service'::text, 'evolution_pilot'::text]));
