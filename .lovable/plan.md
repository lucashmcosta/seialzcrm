
# Fase 2 — Migração Central Trabalhista para credenciais per-integration

Objetivo: gravar `app_secret_encrypted` e `verify_token_encrypted` dentro do `connected_account` da integração `meta-whatsapp-cloud` da Central Trabalhista, copiando os valores atuais dos secrets globais. Nada mais é alterado. Secrets globais permanecem ativos como fallback (Fase 3 fica para depois).

## Por que precisa de edge function

`encryptSecret` (AES-GCM) só roda no runtime das edge functions, pois depende de `META_TOKEN_ENCRYPTION_KEY`. Não dá para fazer essa migração via SQL puro — o valor cifrado tem que ser produzido dentro do mesmo runtime que as functions `meta-whatsapp-*` usam para decifrar.

## Passos

### 1. Identificar a organização da Central Trabalhista
- Query read-only em `organizations` filtrando pelo nome "Central Trabalhista" para obter `organization_id`.
- Query em `organization_integrations` + `admin_integrations` (slug `meta-whatsapp-cloud`) para confirmar que a integração existe, está `is_enabled = true` e que o `connected_account` atual ainda **não** tem `app_secret_encrypted` / `verify_token_encrypted`.

### 2. Criar edge function descartável `meta-whatsapp-migrate-credentials`
Função admin-only, usada uma única vez (será removida na Fase 3).

Comportamento:
- Valida JWT do chamador e confirma que é admin via `admin_users` (ou super_admin), recusando qualquer chamada sem essa permissão.
- Recebe `{ organizationId, dryRun? }` no body.
- Lê `META_WHATSAPP_APP_SECRET` e `META_WHATSAPP_VERIFY_TOKEN` do ambiente. Se algum estiver ausente, retorna erro explicando.
- Busca `organization_integrations` da org pelo slug `meta-whatsapp-cloud`.
- Lê o `connected_account` atual.
- Se `dryRun`, devolve um diff (campos que seriam tocados, sem persistir).
- Caso contrário:
  - Cifra os dois valores com `encryptSecret`.
  - Faz `update` em `connected_account` **mesclando** apenas:
    - `app_secret_encrypted`
    - `verify_token_encrypted`
    - `credentials_migrated_at` (timestamp informativo)
  - Preserva tudo o mais (`access_token_encrypted`, `app_id`, `waba_id`, `phone_number_id`, `display_phone_number`, `verified_name`, `token_stored_at`, etc.).
- **Não toca** em `config_values`, `communication_endpoints`, `messages`, `message_threads`, nem em qualquer recurso Twilio.
- Retorna o estado novo do `connected_account` com os secrets mascarados (apenas comprimento + prefixo `v1:`) para auditoria.

### 3. Executar a migração
- Rodar dry-run primeiro via `supabase--curl_edge_functions` para conferir o diff.
- Confirmar o resultado e rodar a chamada real apenas para a Central Trabalhista.
- Validar diretamente no banco (`supabase--read_query`) que `connected_account ? 'app_secret_encrypted'` e `connected_account ? 'verify_token_encrypted'` são `true`, e que `access_token_encrypted`, `phone_number_id`, `waba_id`, `app_id` continuam idênticos aos de antes (snapshot antes/depois).

### 4. Validar que a Central passou a usar credenciais per-integration

Adicionar logs temporários explícitos em `_shared/meta-whatsapp/credentials.ts` (mínimos, só para esta janela) informando qual fonte resolveu o secret: `per_integration` ou `global_fallback`, junto do `phone_number_id` (sem vazar o secret em si).

Depois executar os seis fluxos da Central e ler `supabase--edge_function_logs`:

1. **Webhook GET (handshake)** — chamar `meta-whatsapp-webhook` com `hub.mode=subscribe` e o verify token; esperar log `verify_token_source=per_integration`.
2. **Webhook POST (inbound texto)** — disparar uma mensagem WhatsApp real para o número da Central; checar nos logs `app_secret_source=per_integration` no HMAC.
3. **Inbound mídia** — enviar uma imagem para a Central; confirmar download de mídia usando `appsecret_proof` per-integration.
4. **Envio texto** — enviar pelo CRM uma mensagem texto a partir de um thread da Central; log `app_secret_source=per_integration` em `meta-whatsapp-send`.
5. **Envio mídia** — enviar pelo CRM um anexo (imagem/PDF); mesmo log esperado.
6. **Verify endpoint** — chamar `meta-whatsapp-verify` para a Central; confirmar `validation_error: null` e log per-integration.

Critério de sucesso da Fase 2: em todos os seis fluxos, nenhum log emite `source=global_fallback` para a Central.

### 5. Encerramento da Fase 2
- Manter `META_WHATSAPP_APP_SECRET` e `META_WHATSAPP_VERIFY_TOKEN` configurados (Viagi e qualquer tenant futuro ainda não migrado continuam funcionando via fallback até serem conectados pela UI).
- Manter a edge function `meta-whatsapp-migrate-credentials` no repositório, mas marcada como deprecated no topo do arquivo, para reuso caso surja outro tenant legado.
- Remover os logs temporários adicionados no passo 4 depois da validação.
- Fase 3 (remover fallback global, apagar `meta-whatsapp-platform-status` e `MetaWhatsAppPlatformConfig`, deletar os secrets globais) continua **fora deste escopo**.

## Riscos e mitigação

- **Risco**: gravar valor errado e quebrar webhook da Central. **Mitigação**: dry-run + snapshot antes/depois + manter fallback global ativo, então qualquer falha de decrypt cai automaticamente no global atual.
- **Risco**: chave de encriptação divergente entre runtime e dados antigos. **Mitigação**: `_shared/crypto.ts` já tenta múltiplos formatos de chave; o teste do passo 4.2 (inbound real) prova end-to-end.
- **Risco**: edge function aberta indevidamente. **Mitigação**: exige JWT admin; sem isso, 403.

## Arquivos previstos

- `supabase/functions/meta-whatsapp-migrate-credentials/index.ts` (novo, descartável)
- `supabase/functions/_shared/meta-whatsapp/credentials.ts` (logs temporários `app_secret_source` / `verify_token_source`)
- `.lovable/plan.md` (registro da execução da Fase 2)

Nenhuma migração SQL, nenhuma alteração em UI, nenhuma mudança em `meta-whatsapp-send`, `meta-whatsapp-webhook`, `meta-whatsapp-verify` ou `meta-whatsapp-connect` além do log via helper compartilhado.
