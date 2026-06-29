## Objetivo

Cada integração Meta passa a usar **somente o próprio token**. Acaba o fallback silencioso entre slugs. WhatsApp Cloud e Twilio ficam 100% fora.

## Garantias

1. `meta` segue funcionando se `connected_account.system_user_token_encrypted` próprio decriptar.
2. `meta-lead-ads` segue funcionando com seus próprios `system_user_token_encrypted` e `page_access_token_encrypted` (caminho crítico já é isolado hoje — o fallback só existia nas funções de discovery/insights de ads).
3. `meta-capi` segue funcionando se tiver `access_token_encrypted` próprio.
4. Sem token próprio → erro claro (`token_decrypt_failed` / `capi_token_missing`) apontando o slug e pedindo reconexão. Nunca usa token de outra integração.
5. `meta-whatsapp-cloud` permanece intocado: confirmado por busca — `_shared/meta-token.ts` só referencia `meta`, `meta-lead-ads`, `meta-capi`; zero ocorrências de `meta-whatsapp`. WhatsApp Cloud usa `_shared/meta-whatsapp/credentials.ts` e a tabela `connected_account` do próprio slug.

## Fase 0 — Auditoria read-only (entregar no chat antes de mexer no código)

Três queries via `supabase--read_query`:

**A. Tokens próprios por slug × org**
```sql
select ai.slug, oi.organization_id, o.name,
  (oi.connected_account->>'system_user_token_encrypted') is not null as has_system_user_token,
  (oi.connected_account->>'page_access_token_encrypted') is not null as has_page_token,
  (oi.connected_account->>'access_token_encrypted') is not null as has_access_token,
  oi.connected_account->>'token_source' as token_source,
  oi.is_enabled, oi.updated_at
from organization_integrations oi
join admin_integrations ai on ai.id = oi.integration_id
left join organizations o on o.id = oi.organization_id
where ai.slug in ('meta','meta-lead-ads','meta-capi')
order by ai.slug, o.name;
```

**B. Orgs dependentes de `token_source='meta-lead-ads'` em `meta-capi`** — vão precisar re-rodar `meta-capi-connect-from-existing` (que após o ajuste passa a gravar o token próprio) ou reconectar CAPI manualmente:
```sql
select oi.organization_id, o.name, oi.connected_account
from organization_integrations oi
join admin_integrations ai on ai.id = oi.integration_id
left join organizations o on o.id = oi.organization_id
where ai.slug='meta-capi'
  and oi.connected_account->>'token_source' = 'meta-lead-ads';
```

**C. Orgs com `meta` enabled mas sem `system_user_token_encrypted`** — dependiam do fallback em `meta-discover-*`; precisam reconectar Meta:
```sql
select oi.organization_id, o.name
from organization_integrations oi
join admin_integrations ai on ai.id = oi.integration_id
left join organizations o on o.id = oi.organization_id
where ai.slug='meta'
  and oi.is_enabled = true
  and coalesce(oi.connected_account->>'system_user_token_encrypted','') = '';
```

**Entrega:** tabela única com:
- orgs OK por slug,
- orgs que precisam reconectar `meta`,
- orgs que precisam reconectar `meta-capi`,
- orgs `meta-lead-ads` (apenas confirmação de não-regressão).

**Stop point:** apresento o relatório e espero "pode aplicar" antes da Fase 1.

## Fase 1 — Código (opção b)

1. **`supabase/functions/_shared/meta-token.ts`**
   - Remover `getFallbackTokenCandidates` e `syncRecoveredTokenToMeta`.
   - Reescrever `resolveMetaAccessToken(admin, orgId, encryptedToken)` para apenas `decryptSecret(encryptedToken)`. Em falha: `throw new Error("token_decrypt_failed")` com log `[meta-token] slug=<caller> org=<id> result=fail`.

2. **`supabase/functions/meta-discover-ad-accounts/index.ts`**
   - Remover bloco de fallback (≈245–274) e chamada a `syncRecoveredTokenToMeta`.
   - `sourceSlug` fixo em `"meta"`.
   - Falha de decrypt → 500 `token_decrypt_failed` "reconecte a integração Meta".

3. **`supabase/functions/meta-discover-ads-cron/index.ts`** e **`supabase/functions/marketing-insights-sync-daily/index.ts`**
   - Trocar `resolveMetaAccessToken(...)` por `decryptSecret(cred.system_user_token_encrypted)` direto, usando o slug que a própria query já resolveu (sem cair em outro slug).

4. **`supabase/functions/meta-capi-send-event/index.ts`**
   - Remover ramo `ca?.token_source === "meta-lead-ads"` (linhas 109–121).
   - `getAccessToken` lê **apenas** `ca.access_token_encrypted`.
   - Ausente → erro `capi_token_missing` instruindo reconectar CAPI.

5. **`supabase/functions/meta-capi-connect-from-existing/index.ts`**
   - Continua existindo. Mudança: ao gravar `meta-capi.connected_account`, **cifra e copia** o token para `access_token_encrypted` da própria CAPI (em vez de `null + token_source: "meta-lead-ads"`).
   - Remover `token_source` do payload gravado.

6. **Observabilidade** — log padronizado `[meta-token] slug=<slug> org=<id> result=ok|fail reason=<...>` em B, C, D.

## Fase 2 — Validação pós-deploy

- `tsgo` automático + deploy das 5 funções.
- Smoke via `supabase--curl_edge_functions`:
  - `meta-whatsapp-send` template real → 200.
  - `meta-whatsapp-webhook` GET verify + POST exemplo → `signature_match: true`.
  - `meta-discover-ad-accounts` numa org Meta com token próprio → 200 com ad_accounts.
  - `meta-lead-ads-poll` numa org afetada → não regrediu.
  - `meta-capi-send-event` org com token próprio → Lead enviado; org sem → `capi_token_missing`.
- Twilio: não tocado.

## Fase 3 — Auditoria pós (read-only)

Re-rodar queries A/B/C e listar:
- orgs que ainda precisam reconectar (`meta` ou `meta-capi`),
- confirmação de que nenhuma org `meta-lead-ads` regrediu,
- confirmação de que WhatsApp Cloud não foi tocado (sem deploy de função `meta-whatsapp-*`).

## Fora de escopo

- `meta-whatsapp-cloud` (send, webhook, connect, verify, dialog, `_shared/meta-whatsapp/credentials.ts`, `connected_account` do slug).
- Twilio (qualquer função `twilio-*`).
- Reconectar página Meta da Viagi e rodar `meta-lead-ads-recovery-viagi` — só depois deste PR.
