## Fase 1 — Isolamento de tokens Meta (aplicar agora)

Auditoria Fase 0 concluída. Sem mudanças de dados. WhatsApp Cloud e Twilio fora.

### Mudanças de código

1. **`supabase/functions/_shared/meta-token.ts`**
   - Remover `getFallbackTokenCandidates` e `syncRecoveredTokenToMeta`.
   - `resolveMetaAccessToken(admin, orgId, encryptedToken, callerSlug)` passa a só decriptar o token recebido. Em falha: `throw new Error("token_decrypt_failed")` com log `[meta-token] slug=<caller> org=<id> result=fail reason=<msg>`. Em sucesso: log `result=ok`.

2. **`supabase/functions/meta-discover-ad-accounts/index.ts`**
   - Remover bloco de fallback (≈245–274) e `syncRecoveredTokenToMeta` local (este arquivo tem cópia própria).
   - `sourceSlug` fixo em `"meta"`.
   - Falha de decrypt → 500 `token_decrypt_failed` com mensagem "Reconecte a integração Meta".

3. **`supabase/functions/meta-discover-ads-cron/index.ts`** e **`supabase/functions/marketing-insights-sync-daily/index.ts`**
   - Trocar `resolveMetaAccessToken(...)` por `decryptSecret(cred.system_user_token_encrypted)` direto, usando o slug que a própria query já resolveu.

4. **`supabase/functions/meta-capi-send-event/index.ts`**
   - Remover ramo `ca?.token_source === "meta-lead-ads"`.
   - `getAccessToken` lê **apenas** `ca.access_token_encrypted`.
   - Ausente → `capi_token_missing` instruindo reconectar CAPI.

5. **`supabase/functions/meta-capi-connect-from-existing/index.ts`**
   - Ao gravar `meta-capi.connected_account`: cifrar e copiar o token para `access_token_encrypted` da própria CAPI.
   - Remover `token_source` do payload gravado.

6. **Logs padronizados** `[meta-token] slug=… org=… result=ok|fail reason=…` em 2/3/4.

### Deploy

`supabase deploy` das 5 funções tocadas:
- `meta-discover-ad-accounts`
- `meta-discover-ads-cron`
- `marketing-insights-sync-daily`
- `meta-capi-send-event`
- `meta-capi-connect-from-existing`

### Fase 2 — Validação pós-deploy (smoke via `supabase--curl_edge_functions`)

- `meta-whatsapp-send` (Central, template real) → 200. Confirma WhatsApp Cloud intocado.
- `meta-whatsapp-webhook` GET verify → 200.
- `meta-discover-ad-accounts` Central → 200 com ad_accounts.
- `meta-discover-ad-accounts` Viagi → esperado 500 `token_decrypt_failed` (sintoma esperado, será resolvido com reconexão).
- `meta-lead-ads-poll` (cron sintético) → não regrediu vs antes.
- `meta-capi-send-event` Viagi (test event) → Lead enviado com o token próprio existente.
- Twilio: não tocado, sem chamada.

### Fase 3 — Auditoria pós (read-only)

Re-rodar queries A/B/C da Fase 0:
- confirmar nenhum slug `meta-lead-ads` regrediu;
- confirmar Viagi CAPI ainda manda evento;
- listar Viagi `meta` como pendente de reconexão.

### Fora de escopo (mantido)

- `meta-whatsapp-cloud`, `_shared/meta-whatsapp/credentials.ts`, qualquer função `meta-whatsapp-*`.
- Qualquer função `twilio-*`.
- Reconectar página Meta da Viagi e rodar `meta-lead-ads-recovery-viagi` — só depois.
- Alteração de dados em `organization_integrations` (nenhum UPDATE/migração).
