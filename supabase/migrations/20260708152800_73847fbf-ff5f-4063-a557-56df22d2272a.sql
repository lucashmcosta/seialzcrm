-- M3: Drop unique legado e cria uniques parciais multi-WABA (pré-check verde).

-- 1) Drop unique legado que impedia 2ª WABA por organização.
ALTER TABLE public.organization_integrations
  DROP CONSTRAINT IF EXISTS organization_integrations_integration_id_organization_id_key;

-- 2) Unique parcial: uma linha "legada/principal" (sem meta_waba_id) por (org, integration).
--    Cobre integrações NÃO-Meta e a linha legada Meta que ainda não tenha meta_waba_id.
CREATE UNIQUE INDEX IF NOT EXISTS organization_integrations_legacy_unique
  ON public.organization_integrations (organization_id, integration_id)
  WHERE meta_waba_id IS NULL;

-- 3) Unique parcial multi-WABA: uma linha por (org, integration, meta_waba_id).
--    Já criado no M1; mantido idempotente.
CREATE UNIQUE INDEX IF NOT EXISTS organization_integrations_meta_waba_unique
  ON public.organization_integrations (organization_id, integration_id, meta_waba_id)
  WHERE meta_waba_id IS NOT NULL;

-- 4) Unique GLOBAL parcial em communication_endpoints.sender_sid para providers Meta.
--    Garante que um phone_number_id nunca seja reutilizado em duas linhas Meta,
--    inclusive entre organizações (proteção defensiva contra roteamento cruzado).
CREATE UNIQUE INDEX IF NOT EXISTS communication_endpoints_meta_sender_sid_unique
  ON public.communication_endpoints (sender_sid)
  WHERE provider IN ('meta_cloud_api', 'meta_cloud_api_coexistence')
    AND sender_sid IS NOT NULL;