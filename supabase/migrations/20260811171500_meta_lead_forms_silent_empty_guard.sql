-- Hardening for the 2026-08-11 silent Meta lead-ingestion outage.
--
-- Root cause: a Page token issued by an app WITHOUT leads_retrieval Advanced
-- Access reads the form node (leads_count) fine but returns an empty /leads edge
-- (HTTP 200, no error). The poll treated that as "success, 0 leads" and stopped
-- ingesting silently.
--
-- These columns let meta-lead-ads-poll detect the condition: compare the
-- cumulative leads_count against the last observed value and, if it grew while
-- the fetch returned nothing, flag the page as degraded and notify once.
ALTER TABLE public.lead_forms
  ADD COLUMN IF NOT EXISTS last_seen_leads_count bigint,
  ADD COLUMN IF NOT EXISTS silent_empty_alerted_at timestamptz;

COMMENT ON COLUMN public.lead_forms.last_seen_leads_count IS
  'Last observed Meta form leads_count (cumulative). Baseline for the poll''s silent-empty detector.';
COMMENT ON COLUMN public.lead_forms.silent_empty_alerted_at IS
  'When the silent-empty (degraded lead access) alert was last sent for this form; cleared on recovery.';
