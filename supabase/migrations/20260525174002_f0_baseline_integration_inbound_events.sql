-- =====================================================================
-- Ingestion V1 · Fase 0 — BASELINE: integration_inbound_events (Inbox v2)
-- =====================================================================
-- CREATE base out-of-band (só ALTERs rastreados existiam, a partir de
-- 20260525175010 — que FALHAVAM num reset do zero por falta desta tabela).
-- DDL capturado FIELMENTE de produção (pg_attribute/format_type,
-- pg_get_constraintdef, pg_indexes, pg_policies). Timestamp ANTES do 1º ALTER.
-- Idempotente (IF NOT EXISTS): no-op em produção, cria do zero no reset.
-- NÃO altera comportamento/dados.
--
-- Nota (para F1, não corrigir aqui): o CHECK de process_status permite
-- ('received','processed','failed','replayed','skipped'), enquanto alguns RPCs
-- referenciam 'processing'/'retry'/'dead_letter'. Divergência de prod
-- preservada fielmente; reconciliação é escopo da F1.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.integration_inbound_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  integration_slug text NOT NULL,
  source_event text NOT NULL,
  external_id text,
  idempotency_key text,
  raw_payload jsonb NOT NULL,
  raw_headers jsonb,
  http_method text,
  request_path text,
  received_at timestamptz NOT NULL DEFAULT now(),
  process_status text NOT NULL DEFAULT 'received'::text,
  processed_at timestamptz,
  process_error text,
  parser_function text,
  parser_version integer,
  parse_attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  resulting_contact_id uuid,
  resulting_opportunity_id uuid,
  resulting_message_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + '90 days'::interval),
  event_version integer NOT NULL DEFAULT 1,
  trace_id uuid,
  correlation_id uuid,
  aggregate_type text,
  aggregate_id text,
  sequence_number bigint,
  signature_valid boolean,
  signature_algo text,
  source_ip inet,
  headers jsonb,
  retry_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_run_at timestamptz,
  claimed_at timestamptz,
  claimed_by text,
  error_classification text,
  dead_letter_reason text,
  replay_count integer NOT NULL DEFAULT 0,
  handler_key text,
  shadow_mode boolean NOT NULL DEFAULT true,
  CONSTRAINT integration_inbound_events_pkey PRIMARY KEY (id),
  CONSTRAINT integration_inbound_events_status_check
    CHECK ((process_status = ANY (ARRAY['received'::text, 'processed'::text, 'failed'::text, 'replayed'::text, 'skipped'::text]))),
  CONSTRAINT integration_inbound_events_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT integration_inbound_events_resulting_contact_id_fkey
    FOREIGN KEY (resulting_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL,
  CONSTRAINT integration_inbound_events_resulting_message_id_fkey
    FOREIGN KEY (resulting_message_id) REFERENCES public.messages(id) ON DELETE SET NULL,
  CONSTRAINT integration_inbound_events_resulting_opportunity_id_fkey
    FOREIGN KEY (resulting_opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL
);

-- Índices (captura fiel de prod)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_iie_slug_idempotency
  ON public.integration_inbound_events USING btree (integration_slug, idempotency_key)
  WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_iie_aggregate
  ON public.integration_inbound_events USING btree (integration_slug, aggregate_type, aggregate_id, sequence_number)
  WHERE (aggregate_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_iie_claimed_processing
  ON public.integration_inbound_events USING btree (claimed_at)
  WHERE (process_status = 'processing'::text);
CREATE INDEX IF NOT EXISTS idx_iie_expires_cleanup
  ON public.integration_inbound_events USING btree (expires_at)
  WHERE (process_status = ANY (ARRAY['processed'::text, 'replayed'::text, 'skipped'::text]));
CREATE INDEX IF NOT EXISTS idx_iie_external_id
  ON public.integration_inbound_events USING btree (integration_slug, external_id)
  WHERE (external_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_iie_failed
  ON public.integration_inbound_events USING btree (received_at DESC)
  WHERE (process_status = 'failed'::text);
CREATE INDEX IF NOT EXISTS idx_iie_handler_key
  ON public.integration_inbound_events USING btree (handler_key)
  WHERE (handler_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_iie_org_received
  ON public.integration_inbound_events USING btree (organization_id, received_at DESC)
  WHERE (organization_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_iie_shadow_received
  ON public.integration_inbound_events USING btree (integration_slug, received_at)
  WHERE ((shadow_mode = true) AND (process_status = 'received'::text));
CREATE INDEX IF NOT EXISTS idx_iie_slug_status
  ON public.integration_inbound_events USING btree (integration_slug, process_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_iie_status_next_run
  ON public.integration_inbound_events USING btree (process_status, next_run_at)
  WHERE (process_status = ANY (ARRAY['received'::text, 'retry'::text]));
CREATE INDEX IF NOT EXISTS idx_iie_trace_id
  ON public.integration_inbound_events USING btree (trace_id)
  WHERE (trace_id IS NOT NULL);

-- RLS (captura fiel: leitura para admins e membros da org)
ALTER TABLE public.integration_inbound_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read inbound events" ON public.integration_inbound_events;
CREATE POLICY "admins read inbound events" ON public.integration_inbound_events
  FOR SELECT TO authenticated USING (is_admin_user());

DROP POLICY IF EXISTS "org members read inbound events" ON public.integration_inbound_events;
CREATE POLICY "org members read inbound events" ON public.integration_inbound_events
  FOR SELECT TO authenticated
  USING (((organization_id IS NOT NULL) AND (organization_id = ANY (current_user_org_ids()))));
