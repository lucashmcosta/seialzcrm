UPDATE public.opportunities
SET close_date = updated_at::date
WHERE deleted_at IS NULL
  AND status = 'lost'
  AND close_date IS NULL;