
-- M1: Schema aditivo multi-WABA (não destrutivo)
-- Não altera o unique antigo (integration_id, organization_id).
-- Não modifica comportamento — apenas prepara a base para PR1.

-- 1) Nova tabela: credenciais do App Meta compartilhadas por organização.
CREATE TABLE public.meta_app_credentials (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id                   text NOT NULL,
  app_secret_encrypted     text NOT NULL,
  access_token_encrypted   text NOT NULL,
  verify_token_encrypted   text,
  created_by_user_id       uuid REFERENCES public.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_app_credentials_organization_id_key UNIQUE (organization_id)
);

-- GRANTS (nenhuma leitura anon; escritas via edge com service_role)
GRANT SELECT ON public.meta_app_credentials TO authenticated;
GRANT ALL ON public.meta_app_credentials TO service_role;

-- RLS
ALTER TABLE public.meta_app_credentials ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro da organização (colunas cifradas são inúteis sem chave;
-- ainda assim, o frontend deve selecionar apenas app_id/created_at/updated_at).
CREATE POLICY "meta_app_credentials_select_org_members"
  ON public.meta_app_credentials
  FOR SELECT
  TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

-- Escrita: bloqueada para authenticated. Toda mutação passa por edge function (service_role).

-- Trigger de updated_at (reaproveita função existente do projeto)
CREATE TRIGGER trg_meta_app_credentials_updated_at
  BEFORE UPDATE ON public.meta_app_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Colunas aditivas em organization_integrations (todas NULL — não muda comportamento).
ALTER TABLE public.organization_integrations
  ADD COLUMN meta_credentials_id uuid REFERENCES public.meta_app_credentials(id) ON DELETE SET NULL,
  ADD COLUMN meta_waba_id        text,
  ADD COLUMN display_name        text;

-- 3) Índices aditivos (não conflitam com o unique antigo).
-- Unique parcial por (org, integration, waba_id) — só ativa quando meta_waba_id preenchido.
-- Enquanto o backfill (M2) não rodar, todas as rows Meta terão meta_waba_id=NULL e não colidem.
CREATE UNIQUE INDEX organization_integrations_meta_waba_unique
  ON public.organization_integrations (organization_id, integration_id, meta_waba_id)
  WHERE meta_waba_id IS NOT NULL;

CREATE INDEX organization_integrations_meta_credentials_id_idx
  ON public.organization_integrations (meta_credentials_id)
  WHERE meta_credentials_id IS NOT NULL;
