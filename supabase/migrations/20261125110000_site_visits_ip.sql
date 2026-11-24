-- Pixel do Seialz: guarda o IP do visitante (decisão do produto, 23/11/2026).
-- Serve para casar a visita com a conversão enviada à Meta/Google. Some junto com a visita (13 meses sem contato).
BEGIN;
ALTER TABLE public.site_visits ADD COLUMN IF NOT EXISTS ip_address inet;
DROP FUNCTION IF EXISTS public.site_pixel_record_visit(text, text, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.site_pixel_record_visit(p_key text, p_visitor text, p_page_host text,
  p_landing text, p_referrer_host text, p_evidence jsonb, p_ip text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_code text; v_n int; v_try int := 0; v_ip inet;
 c_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
BEGIN
 SELECT organization_id INTO v_org FROM site_pixels WHERE public_key = p_key;
 IF v_org IS NULL THEN RETURN NULL; END IF;
 BEGIN v_ip := NULLIF(trim(p_ip), '')::inet; EXCEPTION WHEN others THEN v_ip := NULL; END;
 SELECT ref_code INTO v_code FROM site_visits
  WHERE organization_id = v_org AND visitor_id = p_visitor AND occurred_at > now() - interval '30 minutes'
    AND evidence - 'landing_url' = COALESCE(p_evidence, '{}'::jsonb) - 'landing_url'
  ORDER BY occurred_at DESC LIMIT 1;
 IF v_code IS NOT NULL THEN RETURN v_code; END IF;
 SELECT count(*) INTO v_n FROM site_visits
  WHERE organization_id = v_org AND visitor_id = p_visitor AND occurred_at > now() - interval '1 day';
 IF v_n >= 50 THEN
  SELECT ref_code INTO v_code FROM site_visits WHERE organization_id = v_org AND visitor_id = p_visitor
   ORDER BY occurred_at DESC LIMIT 1;
  RETURN v_code;
 END IF;
 LOOP
  v_try := v_try + 1;
  SELECT string_agg(substr(c_alpha, 1 + floor(random() * length(c_alpha))::int, 1), '') INTO v_code FROM generate_series(1, 8);
  BEGIN
   INSERT INTO site_visits (organization_id, visitor_id, ref_code, page_host, landing_url, referrer_host, evidence, ip_address)
   VALUES (v_org, p_visitor, v_code, left(p_page_host, 255), left(p_landing, 1000), left(p_referrer_host, 255), COALESCE(p_evidence, '{}'::jsonb), v_ip);
   RETURN v_code;
  EXCEPTION WHEN unique_violation THEN
   IF v_try >= 5 THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.site_pixel_record_visit(text, text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_pixel_record_visit(text, text, text, text, text, jsonb, text) TO service_role;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('20261125110000','site_visits_ip') ON CONFLICT DO NOTHING;
COMMIT;
