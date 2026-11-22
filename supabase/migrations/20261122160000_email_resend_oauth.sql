-- E-mail: conectar a conta Resend da org por OAuth ("Conectar com Resend"), além da chave colada.
-- O acesso OAuth dura 15 min e é renovado com uma chave de renovação que MUDA a cada renovação: usar uma
-- antiga derruba a conexão. Por isso só uma rotina renova por vez (trava curta no banco).

ALTER TABLE public.organization_email_secrets ALTER COLUMN api_key_encrypted DROP NOT NULL;
ALTER TABLE public.organization_email_secrets ADD COLUMN IF NOT EXISTS auth_type text NOT NULL DEFAULT 'api_key'
  CHECK (auth_type IN ('api_key', 'oauth'));
ALTER TABLE public.organization_email_secrets ADD COLUMN IF NOT EXISTS oauth_access_encrypted text;
ALTER TABLE public.organization_email_secrets ADD COLUMN IF NOT EXISTS oauth_refresh_encrypted text;
ALTER TABLE public.organization_email_secrets ADD COLUMN IF NOT EXISTS oauth_expires_at timestamptz;
ALTER TABLE public.organization_email_secrets ADD COLUMN IF NOT EXISTS refresh_lock_until timestamptz;

ALTER TABLE public.organization_email_settings ADD COLUMN IF NOT EXISTS auth_method text
  CHECK (auth_method IS NULL OR auth_method IN ('api_key', 'oauth'));

-- Pedidos de autorização em andamento (state + verificador PKCE), válidos por 10 minutos. Só o servidor lê.
CREATE TABLE IF NOT EXISTS public.email_oauth_states (
  state text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  code_verifier text NOT NULL,
  return_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
ALTER TABLE public.email_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_oauth_states FROM authenticated, anon;

-- Pega a trava de renovação (30 s). Devolve true para quem pode renovar agora.
CREATE OR REPLACE FUNCTION public.fn_email_oauth_try_lock(p_org uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH got AS (
    UPDATE organization_email_secrets SET refresh_lock_until = now() + interval '30 seconds'
    WHERE organization_id = p_org AND auth_type = 'oauth'
      AND (refresh_lock_until IS NULL OR refresh_lock_until < now())
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM got);
$function$;
REVOKE ALL ON FUNCTION public.fn_email_oauth_try_lock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_email_oauth_try_lock(uuid) TO service_role;
