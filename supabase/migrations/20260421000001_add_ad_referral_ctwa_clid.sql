-- ============================================================================
-- Adiciona ad_referral_ctwa_clid em contacts + documenta ad_referral_media_url
-- ============================================================================
--
-- Contexto:
-- Click-to-WhatsApp Ads (CTWA) do Meta envia um payload Referral com varios
-- campos de atribuicao de campanha. O campo ReferralCtwaClid e o click ID
-- do Meta Ads - unico por clique - e essencial para cruzar eventos de CRM
-- com events API do Meta (ROAS por creative, attribution).
--
-- Schema atual (confirmado via information_schema):
--   ad_referral_source_url   text
--   ad_referral_headline     text
--   ad_referral_body         text
--   ad_referral_media_url    text    <- Twilio envia ReferralMediaId, mas
--                                       o nome ja esta fixado; mantem a coluna
--                                       e documenta via COMMENT
--   ad_referral_source_id    text
--   ad_referral_source_type  text
--   ad_referral_captured_at  timestamptz
--
-- Novo:
--   ad_referral_ctwa_clid    text    <- click ID do Meta, cruza com Conversions API
-- ============================================================================

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ad_referral_ctwa_clid text;

COMMENT ON COLUMN public.contacts.ad_referral_ctwa_clid IS
  'Click ID do Meta Ads (ReferralCtwaClid do Twilio). Unico por clique em anuncio CTWA. Usar para cruzar com Meta Conversions API e atribuir eventos de CRM ao creative/campaign.';

-- Reconcilia nome historico: a coluna se chama ad_referral_media_url mas
-- o Twilio envia o campo como ReferralMediaId (ID do media asset, nao URL).
-- Renomear em prod tem risco maior que valor; documenta e segue.
COMMENT ON COLUMN public.contacts.ad_referral_media_url IS
  'Armazena o Twilio ReferralMediaId (ID do media asset do anuncio, nao URL publica). Nome historico da coluna.';

-- Index parcial: facilita deduplicacao de eventos CAPI por clid e queries
-- de atribuicao. Partial pois a maioria dos contatos nao vem de CTWA.
CREATE INDEX IF NOT EXISTS idx_contacts_ad_referral_ctwa_clid
  ON public.contacts (ad_referral_ctwa_clid)
  WHERE ad_referral_ctwa_clid IS NOT NULL;

COMMIT;
