# BYOK — Seialz Intelligence (v2, corrigida)

## 1. Autorização (corrigido)

Fluxo correto, sem "service_role via JWT do usuário":

```text
Frontend (JWT do usuário, anon key)
   → Edge Function byok-*
       1. supabase.auth.getClaims(jwt) → userId
       2. has_org_role(userId, orgId, 'admin') → bool
       3. Se admin, instancia client INTERNO com SERVICE_ROLE_KEY
       4. Service-role client lê/decripta/escreve a secret
       5. Resposta ao frontend só com dados mascarados
```

- O JWT do usuário NUNCA recebe service_role.
- O service_role NUNCA sai da Edge Function.
- Toda Edge Function BYOK começa com esse mesmo guard (helper `requireOrgAdmin(req, orgId)` em `_shared/intelligence/authz.ts`).

## 2. Fallback para managed (corrigido)

Sem fallback automático. Comportamento por config explícita em `organization_integrations.config_values`:

```json
{
  "fallback_to_managed": false,   // default
  "fallback_on_rate_limit": false
}
```

`resolveProvider(orgId, capability)`:

```text
1. Achou BYOK ativa e verified?
   1a. Tenta usar.
   1b. Se 401/403 do provider:
        - UPDATE config: verified_at=null, last_error, is_active=false
        - INSERT sales_events.event_type='byok_key_invalid'
        - notifyOrgUsers(admins, "Chave <provider> inválida")
        - SE fallback_to_managed=true E plano permite → cai p/ managed
          (loga ai_usage_logs com source='managed_fallback')
        - SENÃO → throw BYOK_INVALID → job marcado como 'paused_byok'
                  (intelligence_jobs.status='paused', next_run=null)
   1c. Se 429/quota:
        - SE fallback_on_rate_limit=true → managed
        - SENÃO → retry exponencial padrão do worker
   1d. Se erro de orçamento mensal (monthly_budget_usd estourado):
        - throw BYOK_BUDGET_EXCEEDED, sem fallback
2. Sem BYOK ativa → managed (se plano permite); senão erro 'no_provider'
```

Plano da org controla `managed_allowed` e `byok_required` (enterprise pode forçar BYOK).

## 3. Storage seguro de chaves (corrigido — sem REVOKE direto)

**Não revogamos `config_values`** porque há 30+ usos em edge functions e ~10 no frontend lendo o jsonb (Twilio, Meta, Kommo, SuvSign etc.). REVOKE quebraria o app.

Estratégia: **nova coluna isolada, nunca no frontend**.

```sql
ALTER TABLE organization_integrations
  ADD COLUMN secret_payload jsonb;   -- contém ciphertext + metadata

COMMENT ON COLUMN organization_integrations.secret_payload IS
  'Encrypted secrets (AES-GCM via _shared/crypto). NEVER select from PostgREST/anon. Service-role only.';

-- RLS continua igual em config_values (compat).
-- Nova coluna fica protegida via column-level grant:
REVOKE SELECT (secret_payload) ON organization_integrations FROM authenticated, anon;
GRANT  SELECT (secret_payload) ON organization_integrations TO service_role;
GRANT  UPDATE (secret_payload) ON organization_integrations TO service_role;
```

Isso é seguro porque nenhum código atual lê `secret_payload` (coluna nova). `config_values` permanece intocado.

Formato de `secret_payload`:

```json
{
  "openai":     { "api_key_encrypted":"v1:iv:ct", "last4":"aB12",
                  "fingerprint":"sha256:…", "verified_at":"…",
                  "verified_model":"gpt-4o-mini", "is_active":true,
                  "rotated_at":null, "last_error":null },
  "elevenlabs": { ... },
  "anthropic":  { ... },
  "gemini":     { ... }
}
```

View pública segura (para o frontend listar status sem ver chave):

```sql
CREATE VIEW vw_org_provider_keys AS
SELECT organization_id,
       jsonb_object_agg(provider, jsonb_build_object(
         'last4', v->>'last4',
         'verified_at', v->>'verified_at',
         'is_active', (v->>'is_active')::bool,
         'rotated_at', v->>'rotated_at',
         'has_error', (v->>'last_error') IS NOT NULL
       )) AS providers
FROM organization_integrations oi,
     LATERAL jsonb_each(COALESCE(oi.secret_payload,'{}'::jsonb)) AS e(provider, v)
GROUP BY organization_id;

ALTER VIEW vw_org_provider_keys SET (security_invoker = true);  -- respeita RLS da OI
```

Plano de migração futura (V1, fora deste MVP): mover segredos hoje em `config_values` (Twilio `auth_token`, Meta token, etc.) para `secret_payload` em ondas, refatorando cada edge function de leitura, e só então aplicar REVOKE em `config_values`. Documentado, não executado agora.

## 4. Custos separados por source

```sql
ALTER TABLE ai_usage_logs
  ADD COLUMN provider           text,
  ADD COLUMN source             text CHECK (source IN ('managed','customer_key','managed_fallback')),
  ADD COLUMN estimated_cost_usd numeric(12,6),
  ADD COLUMN job_id             uuid REFERENCES intelligence_jobs(id) ON DELETE SET NULL;

CREATE INDEX ON ai_usage_logs (organization_id, source, created_at DESC);
```

Views distintas:

```sql
CREATE VIEW vw_org_monthly_cost_managed AS
  SELECT organization_id, provider, date_trunc('month', created_at) AS month,
         SUM(estimated_cost_usd) cost_usd, SUM(total_tokens) tokens
    FROM ai_usage_logs WHERE source IN ('managed','managed_fallback')
   GROUP BY 1,2,3;

CREATE VIEW vw_org_monthly_cost_byok AS
  SELECT organization_id, provider, date_trunc('month', created_at) AS month,
         SUM(estimated_cost_usd) cost_usd, SUM(total_tokens) tokens
    FROM ai_usage_logs WHERE source = 'customer_key'
   GROUP BY 1,2,3;
```

- `managed` + `managed_fallback` somam o custo que recai no Seialz (fallback é sinal de churn-risk → dashboard separado).
- `customer_key` é informativo para o cliente (não cobramos).
- Enforcement de `monthly_budget_usd` lê apenas `vw_org_monthly_cost_byok`.

## 5. Segurança — garantias explícitas

| Risco | Mitigação verificável |
|---|---|
| Chave logada | `console.log` proibido com `api_key`/`secret_payload`; helper `safeLog()` em `_shared/intelligence/log-usage.ts` faz strip por regex (`/sk-[A-Za-z0-9-_]{10,}/`, `/[A-Za-z0-9]{32,}/`). Lint rule futura. |
| Ciphertext ao frontend | Frontend só consulta `vw_org_provider_keys` (não expõe `api_key_encrypted`). Edge functions BYOK retornam apenas `{ last4, verified_at, is_active, has_error }`. Teste de contrato em `byok-*_test.ts`. |
| Erro do provider vazando dados | `sanitizeProviderError(err)`: whitelist de campos (`status`, `code`, `type`) + mensagem genérica por código. Nunca repassa body bruto do provider. |
| Rotação deixando chave antiga acessível | `byok-rotate-key` faz UPDATE atômico: novo `api_key_encrypted` sobrescreve o antigo no mesmo statement (`secret_payload = jsonb_set(...)`). Não há histórico em coluna. Auditoria em `audit_logs` guarda apenas `last4` e `fingerprint`, nunca a chave. |
| Chave revogada ainda usada por worker em voo | `resolveProvider` relê do banco em cada job (sem cache em memória > 60s); revoke seta `is_active=false` e `verified_at=null` → próxima resolução já recusa. |
| `META_TOKEN_ENCRYPTION_KEY` rotação | Documentado: campo `api_key_encrypted` começa com versão (`v1:`). Rotação cria `v2:` e job admin re-criptografa em lote. |

## 6. Edge functions BYOK (assinaturas)

Todas POST, todas começam com `requireOrgAdmin`:

- `byok-set-key`     `{ provider, api_key, fallback_to_managed?, monthly_budget_usd? }` → `{ last4, verified_at }`
- `byok-test-key`    `{ provider }` → `{ ok, error? }` (chama endpoint barato do provider; nunca retorna chave)
- `byok-revoke-key`  `{ provider }` → `{ ok }`
- `byok-rotate-key`  `{ provider, new_api_key }` → `{ last4, verified_at }` (UPDATE atômico)
- `byok-update-policy` `{ provider, fallback_to_managed, fallback_on_rate_limit, monthly_budget_usd }`

## 7. Ajustes no MVP Intelligence

- `analyze-message` e `transcribe-audio` chamam `resolveProvider(orgId, capability)` antes do fetch.
- Wrap do upstream em try/catch → classifica erro (`invalid_key`, `rate_limit`, `budget`, `transient`) → aplica regras do §2.
- Após sucesso: `logAiUsage({ org_id, provider, model, source, tokens, estimated_cost_usd, job_id })`.
- Cálculo de custo via tabela admin `provider_pricing(provider, model, input_per_1k_usd, output_per_1k_usd, audio_per_minute_usd, effective_from)` (seed inicial OpenAI/Anthropic/Gemini/ElevenLabs).

## 8. Ordem de entrega

1. Migration: coluna `secret_payload` + GRANT/REVOKE só nela; colunas em `ai_usage_logs`; tabela `provider_pricing` + seeds; views `vw_org_provider_keys`, `vw_org_monthly_cost_managed`, `vw_org_monthly_cost_byok`; helper `has_org_role`.
2. Shared: `_shared/intelligence/authz.ts`, `resolve-provider.ts`, `log-usage.ts`, `pricing.ts`, `sanitize.ts`.
3. Refator `analyze-message` e `transcribe-audio` para usar resolver + log + classificador de erro.
4. Edge functions `byok-set-key`, `byok-test-key`, `byok-revoke-key`, `byok-rotate-key`, `byok-update-policy`.
5. Testes Deno de contrato (mascaramento, no-leak, fallback gating).
6. UI Settings → AI Providers (loop seguinte).

Sem REVOKE em `config_values`. Sem fallback implícito. Service-role só dentro das Edge Functions.
