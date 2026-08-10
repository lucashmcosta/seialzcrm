-- Fase 1: flag de consolidação de credencial Meta (dual-read canônico + fallback legado).
-- Default GLOBAL OFF → todas as capabilities resolvem o token pelo caminho legado até que a
-- flag seja ligada por org (após paridade comprovada). Ligar por org:
--   INSERT ... (flag_key, organization_id, enabled) VALUES ('meta_canonical_credential', '<org>', true)
--   ON CONFLICT (flag_key, organization_id) DO UPDATE SET enabled=true;
-- Rollback ≤60s (cache TTL da flag). Idempotente.
INSERT INTO public.integration_feature_flags (flag_key, organization_id, enabled)
VALUES ('meta_canonical_credential', NULL, false)
ON CONFLICT (flag_key, organization_id) DO NOTHING;
