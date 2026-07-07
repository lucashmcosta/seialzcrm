
CREATE TABLE public.audio_record_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event TEXT NOT NULL,
  browser TEXT,
  user_agent TEXT,
  mime_type TEXT,
  duration_ms INTEGER,
  size_bytes INTEGER,
  endpoint_id UUID,
  thread_id UUID,
  organization_id UUID,
  user_id UUID,
  error TEXT,
  metadata JSONB
);

CREATE INDEX idx_audio_record_events_created_at ON public.audio_record_events (created_at DESC);
CREATE INDEX idx_audio_record_events_event ON public.audio_record_events (event);
CREATE INDEX idx_audio_record_events_org ON public.audio_record_events (organization_id);

GRANT SELECT, INSERT ON public.audio_record_events TO authenticated;
GRANT ALL ON public.audio_record_events TO service_role;

ALTER TABLE public.audio_record_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can insert audio events"
  ON public.audio_record_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "org members can read their audio events"
  ON public.audio_record_events
  FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = ANY (current_user_org_ids())
  );
