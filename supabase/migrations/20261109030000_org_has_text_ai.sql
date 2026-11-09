-- Diz se os botões de texto com IA funcionam nesta org, com a mesma regra de ai-generate
-- (text-ai-credential.ts): chave própria ativa e verificada, ou chave antiga da integração.
-- Vendedor precisa do botão, mas não precisa ler as chaves: devolve só verdadeiro ou falso.
CREATE OR REPLACE FUNCTION public.rpc_org_has_text_ai(p_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_org = ANY(public.current_user_org_ids()) AND (
    EXISTS (
      SELECT 1 FROM organization_integrations oi
      CROSS JOIN LATERAL jsonb_each(COALESCE(oi.secret_payload, '{}'::jsonb)) e(key, v)
      WHERE oi.organization_id = p_org AND e.key IN ('anthropic', 'openai')
        AND COALESCE((e.v->>'is_active')::boolean, false) AND e.v->>'verified_at' IS NOT NULL
        AND e.v->>'api_key_encrypted' IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM organization_integrations oi
      JOIN admin_integrations ai ON ai.id = oi.integration_id
      WHERE oi.organization_id = p_org AND oi.is_enabled AND ai.slug IN ('claude-ai', 'openai-gpt')
        AND COALESCE(oi.config_values->>'api_key', '') <> ''
    )
  );
$$;
REVOKE ALL ON FUNCTION public.rpc_org_has_text_ai(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_org_has_text_ai(uuid) TO authenticated, service_role;
