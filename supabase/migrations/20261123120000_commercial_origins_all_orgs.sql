-- Origens ligadas para todas as orgs: org nova já nasce com as origens padrão e ligada.
-- (Orgs existentes são ligadas uma a uma, conferindo as telas e o recálculo do histórico.)
CREATE OR REPLACE FUNCTION public.commercial_seed_org(p_org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO commercial_origins(organization_id,code,name)
 SELECT p_org,x.code,x.name FROM (VALUES ('meta_ads','Meta Ads'),('google_ads','Google Ads'),('google_organic','Google orgânico'),
  ('paid_other','Outros anúncios'),('referral','Indicação'),('partner','Parceiro'),('event','Evento'),('direct','Acesso direto'),
  ('social_organic','Social orgânico'),('email','E-mail')) x(code,name)
 ON CONFLICT(organization_id,code) DO NOTHING;
 INSERT INTO commercial_origin_settings VALUES(p_org,true) ON CONFLICT(organization_id) DO UPDATE SET enabled=true;
END $$;
REVOKE ALL ON FUNCTION public.commercial_seed_org(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.commercial_seed_org_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM commercial_seed_org(NEW.id);
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'commercial_seed_org_failed org=% error=%',NEW.id,SQLERRM;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.commercial_seed_org_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS commercial_seed_org ON public.organizations;
CREATE TRIGGER commercial_seed_org AFTER INSERT ON public.organizations
 FOR EACH ROW EXECUTE FUNCTION public.commercial_seed_org_trigger();
