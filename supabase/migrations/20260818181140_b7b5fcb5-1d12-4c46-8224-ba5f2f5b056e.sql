-- Etapa 2 — migração excepcional: endpoint Evolution 7020 da Central herda
-- a configuração de entrada efetiva da organização (hoje = 7067).
DO $$
DECLARE
  v_ep uuid := '3ed219e0-b919-4a1f-b2f6-6806cfafe6f7';
  v_org uuid := '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
  v_settings jsonb;
  v_rows int;
BEGIN
  v_settings := public.fn_default_inbound_settings(v_org, 'commercial');
  IF v_settings IS NULL THEN
    RAISE EXCEPTION 'BACKFILL_7020_NO_REFERENCE_SETTINGS';
  END IF;

  UPDATE public.communication_endpoints
     SET inbound_settings = v_settings, updated_at = now()
   WHERE id = v_ep
     AND organization_id = v_org
     AND provider = 'evolution_api'
     AND purpose = 'commercial'
     AND inbound_settings IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 1 THEN
    RAISE EXCEPTION 'BACKFILL_7020_UNEXPECTED_ROWS: %', v_rows;
  END IF;
  RAISE NOTICE 'endpoint 7020 rows=% settings=%', v_rows, v_settings;
END $$;