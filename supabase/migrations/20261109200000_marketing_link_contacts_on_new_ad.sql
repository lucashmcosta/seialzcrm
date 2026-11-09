-- O vínculo contato -> anúncio só era feito ao criar o contato. Quem chegava antes de o anúncio ser sincronizado
-- ficava sem vínculo para sempre, e a tela de Marketing mostrava zero contatos para aquele anúncio.
-- Agora, quando um anúncio entra, os contatos recentes que vieram por ele são vinculados.
--
-- Vincular dispara o Lead da Conversions API (trg_capi_lead_on_contact_update). Quem já teve Lead enviado não recebe de
-- novo (dedup de meta-capi-send-event). A janela de 7 dias evita mandar à Meta, como novo, um contato antigo sem Lead.
-- app.skip_event_emit evita publicar "contato atualizado" nas integrações, porque nada do cadastro mudou.
CREATE OR REPLACE FUNCTION public.fn_link_contacts_to_new_campaign()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_skip text := current_setting('app.skip_event_emit', true);
BEGIN
  IF NEW.external_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('app.skip_event_emit', 'true', true);
  UPDATE contacts c SET marketing_campaign_id = NEW.id
  WHERE c.organization_id = NEW.organization_id
    AND c.ad_referral_source_id = NEW.external_id
    AND c.marketing_campaign_id IS NULL
    AND c.deleted_at IS NULL
    AND c.created_at >= now() - interval '7 days';
  PERFORM set_config('app.skip_event_emit', COALESCE(v_skip, ''), true);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_link_contacts_to_new_campaign ON public.marketing_campaigns;
CREATE TRIGGER trg_link_contacts_to_new_campaign
AFTER INSERT ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.fn_link_contacts_to_new_campaign();
