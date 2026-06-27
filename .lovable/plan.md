
# Fase 3 — Encerrar a dependência global Meta WhatsApp Cloud

Objetivo: deixar a integração Meta 100% per-tenant. Após esta fase, o único caminho válido para credenciais Meta é o `connected_account` da própria `organization_integrations`. Os secrets globais `META_WHATSAPP_APP_SECRET` e `META_WHATSAPP_VERIFY_TOKEN` deixam de ser lidos pelas funções e a tela admin de configuração global desaparece.

Pré-condição já satisfeita: Central Trabalhista validada nos 4 fluxos com `app_secret_source=per_integration` e sem nenhum `global_fallback` nos logs.

## Mudanças

### 1. Edge Functions — remover qualquer leitura dos globals

**`supabase/functions/_shared/meta-whatsapp/credentials.ts`**
- Remover `globalAppSecret()` e `globalVerifyToken()`.
- Remover o fallback `Deno.env.get("META_WHATSAPP_APP_SECRET")` dentro de `resolveAppSecretForIntegration`.
- Remover o helper `logSource` e todos os logs `app_secret_source` / `verify_token_source` / `global_fallback`.
- `resolveAppSecretForIntegration` passa a retornar somente o valor cifrado per-integration (ou `undefined`).
- `resolveVerifyTokenForIntegration` idem.

**`supabase/functions/_shared/meta-whatsapp/platform.ts`**
- Deletar o arquivo. Não é mais usado.

**`supabase/functions/meta-whatsapp-webhook/index.ts`**
- Remover `import { globalVerifyToken, globalAppSecret }`.
- GET handshake: tirar o bloco "Fallback global (Central durante migração)" — match passa a ser apenas per-integration.
- POST: tirar `if (!appSecret) appSecret = globalAppSecret();` — sem secret per-integration, responde `invalid_signature` (mesmo comportamento de hoje quando não encontra a integração, só sem o fallback).
- Trocar `via: matchedIntegrationId ? "per_integration" : "global_fallback"` por `via: "per_integration"`; o caso sem match retorna 401 antes do log.

**`supabase/functions/meta-whatsapp-send/index.ts`**
- Já usa `resolveAppSecretForIntegration`. Sem mudança funcional — só perde o fallback automático ao desaparecer do helper.

**`supabase/functions/meta-whatsapp-verify/index.ts`**
- Remover `import { getPlatformStatus }` e o campo `platform` da resposta JSON (substituir por status puro `{ connected, meta, validation_error }`).
- Continua usando `resolveAppSecretForIntegration` (sem fallback).

**`supabase/functions/meta-whatsapp-connect/index.ts`**
- Remover o `?? Deno.env.get("META_WHATSAPP_APP_SECRET")` da resolução do `appSecret` usado na validação Graph.
- Para **novas conexões** (org sem `connected_account.app_secret_encrypted` prévio e sem `verify_token_encrypted` prévio), passar a exigir `body.appSecret` e `body.verifyToken` como obrigatórios — retorna `400 missing_field` com `field: "appSecret"` / `"verifyToken"` se ausentes. Edição de uma integração já conectada continua aceitando esses campos vazios (preserva os já cifrados via `priorCa`), garantindo zero regressão para a Central.

**`supabase/functions/meta-whatsapp-platform-status/index.ts`**
- Deletar a função (código + entrada em `supabase/config.toml` `[functions.meta-whatsapp-platform-status]`).
- Chamar `supabase--delete_edge_functions(["meta-whatsapp-platform-status"])` para remover do Supabase.

**`supabase/functions/meta-whatsapp-migrate-credentials/index.ts`**
- Deletar a função (one-shot, papel cumprido).
- Chamar `supabase--delete_edge_functions(["meta-whatsapp-migrate-credentials"])`.
- Remover também o secret `META_MIGRATION_TOKEN` que ficou pendurado.

### 2. Frontend — remover tela e estado da configuração global

**`src/services/metaWhatsAppService.ts`**
- Remover `interface PlatformStatus` e o método `getPlatformStatus`.

**`src/components/admin/MetaWhatsAppPlatformConfig.tsx`**
- Deletar o arquivo.

**`src/pages/admin/AdminIntegrationDetail.tsx`**
- Remover o import e o uso de `<MetaWhatsAppPlatformConfig />` (linhas 18 e 293).

**`src/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog.tsx`**
- Remover `platformQuery`, o Card "Status da plataforma" e o Alert "Configuração global pendente".
- Tornar `appSecret` e `verifyToken` campos obrigatórios para conexões novas (marcador `*`, `required`, mensagem inline). Em edição (já conectado), manter como opcionais com placeholder "••• configurado" como hoje.
- Atualizar a copy do topo do dialog para deixar claro: "Cada tenant usa o próprio App Meta — preencha todos os campos com os dados do App da sua organização."
- Os 7 campos pedidos (App ID, App Secret, Verify Token, WABA ID, Phone Number ID, Número E.164, System User Token) já existem; só ajustar labels/asteriscos/placeholders.

### 3. Secrets globais

Após confirmação dos 4 testes finais na Central, **remover** do projeto:
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_VERIFY_TOKEN`
- `META_MIGRATION_TOKEN`

Feito via `secrets--delete_secret`. `META_TOKEN_ENCRYPTION_KEY` permanece — ele cifra/decifra todos os tokens per-integration e nada tem a ver com os globals da Meta.

## O que NÃO é tocado

- Twilio (qualquer função, secret, componente).
- `connected_account` da Central (já tem os dois `*_encrypted` certos; o código novo lê deles).
- `messages`, `message_threads`, `communication_endpoints`, dispatcher (`dispatchWhatsAppSend.ts`), mídia Meta, storage de mídia.
- `_shared/crypto.ts` e `_shared/meta-whatsapp/graph.ts`.
- Schema de banco: nenhuma migração SQL — todos os campos novos já existem em `connected_account` (JSONB).

## Validação após o deploy

Repetir os 4 testes na Central:
1. Inbound texto.
2. Inbound mídia.
3. Outbound texto pelo CRM.
4. Outbound mídia pelo CRM.

Critério de sucesso:
- Logs de `meta-whatsapp-webhook` e `meta-whatsapp-send` saem **sem** `app_secret_source` / `verify_token_source` / `global_fallback` (esses prints foram removidos).
- Mensagens persistidas em `messages` com `media_type` + `media_urls` corretos nos casos de mídia.
- `meta-whatsapp-verify` retorna `connected: true` para a Central.
- Frontend admin não renderiza mais "Status da plataforma global Meta WhatsApp Cloud" — confirmação visual em `/admin/integrations/...`.

Se algo na Central falhar com `invalid_signature` ou `no_app_secret_available`, o rollback é trivial: a Central tem os secrets per-integration corretos, então a falha indicaria bug de código, não de dados.

## Riscos

- **Único risco real**: alguma terceira organização tinha sido conectada à força usando o fallback global e está sem `app_secret_encrypted`/`verify_token_encrypted` próprios. Mitigação: query `SELECT organization_id FROM organization_integrations oi JOIN admin_integrations ai ON ai.id=oi.integration_id WHERE ai.slug='meta-whatsapp-cloud' AND oi.is_enabled AND NOT (oi.connected_account ? 'app_secret_encrypted')` antes de remover os secrets globais. Se devolver só a Central (que já está OK), pode deletar com segurança. Se aparecer outra org, paro e te aviso.

## Arquivos previstos

Deletados:
- `supabase/functions/meta-whatsapp-platform-status/index.ts`
- `supabase/functions/meta-whatsapp-migrate-credentials/index.ts`
- `supabase/functions/_shared/meta-whatsapp/platform.ts`
- `src/components/admin/MetaWhatsAppPlatformConfig.tsx`

Editados:
- `supabase/config.toml`
- `supabase/functions/_shared/meta-whatsapp/credentials.ts`
- `supabase/functions/meta-whatsapp-webhook/index.ts`
- `supabase/functions/meta-whatsapp-verify/index.ts`
- `supabase/functions/meta-whatsapp-connect/index.ts`
- `src/services/metaWhatsAppService.ts`
- `src/pages/admin/AdminIntegrationDetail.tsx`
- `src/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog.tsx`
- `.lovable/plan.md`

Secrets removidos: `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`, `META_MIGRATION_TOKEN`.
