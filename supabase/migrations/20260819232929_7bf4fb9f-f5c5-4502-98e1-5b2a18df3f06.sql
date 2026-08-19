REVOKE ALL ON FUNCTION public.provision_line_endpoint_core(uuid,uuid,uuid,text,text,text,text,text,uuid,text,text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.provision_line_endpoint_twilio_verified(uuid,uuid,uuid,text,text,text,text,text,uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_line_endpoint_core(uuid,uuid,uuid,text,text,text,text,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_line_endpoint_twilio_verified(uuid,uuid,uuid,text,text,text,text,text,uuid) TO service_role;