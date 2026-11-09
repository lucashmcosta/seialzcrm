-- Contato chega por um anúncio que ainda não conhecemos: busca os anúncios da org na hora, em vez de esperar a rodada.
-- O anúncio entra, e trg_link_contacts_to_new_campaign faz o vínculo. Inclui os contatos que chegarem enquanto a busca roda.
CREATE TABLE IF NOT EXISTS public.marketing_ad_discovery_requests (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, external_id)
);
-- Uso interno do gatilho: sem política, nenhum usuário lê nem grava.
ALTER TABLE public.marketing_ad_discovery_requests ENABLE ROW LEVEL SECURITY;

-- Limites: anúncio que a Meta não devolve (de outra conta, por exemplo) só tenta de novo em 6 horas, e uma org não dispara
-- mais de uma busca a cada 2 minutos, porque cada busca já traz todos os anúncios da conta.
-- Falha aqui nunca impede criar o contato: a rodada de hora em hora cobre.
CREATE OR REPLACE FUNCTION public.fn_discover_on_unknown_ad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_new boolean;
BEGIN
  BEGIN
    INSERT INTO marketing_ad_discovery_requests AS r (organization_id, external_id)
    VALUES (NEW.organization_id, NEW.ad_referral_source_id)
    ON CONFLICT (organization_id, external_id) DO UPDATE SET requested_at = now()
      WHERE r.requested_at < now() - interval '6 hours'
    RETURNING true INTO v_new;
    IF v_new IS NOT TRUE THEN RETURN NEW; END IF;

    IF EXISTS (
      SELECT 1 FROM marketing_ad_discovery_requests r
      WHERE r.organization_id = NEW.organization_id AND r.external_id <> NEW.ad_referral_source_id
        AND r.requested_at > now() - interval '2 minutes'
    ) THEN
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-discover-ads-cron',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
      body := jsonb_build_object('organization_id', NEW.organization_id),
      timeout_milliseconds := 120000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_discover_on_unknown_ad failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_discover_on_unknown_ad ON public.contacts;
CREATE TRIGGER trg_discover_on_unknown_ad
AFTER INSERT OR UPDATE OF ad_referral_source_id ON public.contacts
FOR EACH ROW
WHEN (NEW.ad_referral_source_type = 'ad' AND NEW.ad_referral_source_id IS NOT NULL
      AND NEW.marketing_campaign_id IS NULL AND NEW.deleted_at IS NULL)
EXECUTE FUNCTION public.fn_discover_on_unknown_ad();

-- De hora em hora: anúncios novos e números dos que estão ativos. A rodada diária segue revisando 3 dias de todos.
SELECT cron.schedule('meta-discover-ads-hourly', '25 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-discover-ads-cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$cron$);
SELECT cron.schedule('marketing-insights-sync-hourly', '30 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/marketing-insights-sync-daily',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
    body := jsonb_build_object('days_back', 1, 'limit', 100, 'only_active', true),
    timeout_milliseconds := 300000
  );
$cron$);
