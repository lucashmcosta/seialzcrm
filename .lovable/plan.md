
# Diagnóstico + Plano de migração Meta WhatsApp Cloud (multi-App)

## 1. Auditoria — onde os secrets globais são usados hoje

Secrets globais existentes:
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_VERIFY_TOKEN`

Pontos de leitura no código:

| Arquivo | Linha | Uso | Criticidade |
|---|---|---|---|
| `supabase/functions/_shared/meta-whatsapp/platform.ts` | 10-13 | `getPlatformStatus()` — diz se webhook está "ativo" | Gate global de webhook |
| `supabase/functions/meta-whatsapp-webhook/index.ts` | 68 | Compara `hub.verify_token` no handshake GET | **Bloqueante multi-tenant** |
| `supabase/functions/meta-whatsapp-webhook/index.ts` | 87-88 | Calcula HMAC para validar `X-Hub-Signature-256` | **Bloqueante multi-tenant** |
| `supabase/functions/meta-whatsapp-webhook/index.ts` | 257 | `appsecret_proof` em `metaWaGetMediaUrl` / `metaWaDownloadMedia` (inbound media) | Per-tenant |
| `supabase/functions/meta-whatsapp-send/index.ts` | 187-189, 341, 377 | `appsecret_proof` em uploads e envios | Per-tenant |
| `supabase/functions/meta-whatsapp-connect/index.ts` | 97-119 | `appsecret_proof` ao validar credenciais durante conexão | Per-tenant |
| `supabase/functions/meta-whatsapp-verify/index.ts` | — | `appsecret_proof` na revalidação | Per-tenant |
| `src/components/admin/MetaWhatsAppPlatformConfig.tsx` | — | UI global do status dos secrets | Será removida |
| `src/services/metaWhatsAppService.ts` | `getPlatformStatus` | Chama edge `meta-whatsapp-platform-status` | Será removido |
| `supabase/functions/meta-whatsapp-platform-status` | — | Reporta status global | Será removido |
| `supabase/migrations/20260626211052_…sql` | — | Seed/registro do slug | Sem ação |

Outros pontos sensíveis observados:
- Em `connect`, `send` e `verify` o `appSecret` é passado como **opcional** para o helper `metaWaPostJson/Get`. Hoje funciona porque o App da Central tem `appsecret_proof` configurado como opcional. Para multi-App e maior segurança ele precisa ser **obrigatório por integração**.
- O webhook tem **um único endpoint público** `/functions/v1/meta-whatsapp-webhook`. Multi-App significa que a Meta enviará payloads de Apps diferentes para a mesma URL — a função precisa identificar **qual integração** antes de validar assinatura.

## 2. Modelo de dados alvo

Toda credencial Meta passa a viver em `organization_integrations` (slug `meta-whatsapp-cloud`) — nada novo no schema.

`connected_account` (criptografado o que for sigiloso):
```json
{
  "app_id": "...",
  "waba_id": "...",
  "phone_number_id": "...",
  "display_phone_number": "+55...",
  "verified_name": "...",
  "access_token_encrypted": "<AES-GCM>",     // já existe
  "app_secret_encrypted":  "<AES-GCM>",      // NOVO
  "verify_token_encrypted":"<AES-GCM>",      // NOVO (recomendado criptografar)
  "token_stored_at": "..."
}
```

`config_values` (não-sigilosos, já existem; nada novo).

`communication_endpoints` continua sendo a tabela de lookup do webhook (`provider='meta_cloud_api'`, `sender_sid = phone_number_id`). Ela já carrega `organization_integration_id`, o que basta para resolver as credenciais.

## 3. Mudança crítica de fluxo no webhook

A Meta assina o body com o **App Secret do App** que dispara o evento. Hoje validamos a assinatura **antes** de olhar o payload. Multi-App exige inverter:

```text
POST /meta-whatsapp-webhook
   │
   ├─ ler rawBody
   ├─ JSON.parse "peek" sem confiar ainda
   ├─ extrair entry[].changes[].value.metadata.phone_number_id
   ├─ SELECT endpoint + organization_integration por phone_number_id
   ├─ decryptar app_secret da integração
   ├─ recomputar HMAC e comparar com X-Hub-Signature-256
   ├─ se OK -> processar messages[] / statuses[]
   └─ se múltiplos phone_number_ids no mesmo POST (raro, mas possível
       quando o App agrega vários WABAs): validar por entry, descartando
       só as entries cuja assinatura não fecha.
```

Para o **handshake GET** (`hub.verify_token`), a Meta envia um GET sem identificação de App. Solução padrão e segura: aceitar se o token bater com **qualquer** `verify_token` ativo em `organization_integrations` enabled. Risco: zero — o token é segredo compartilhado entre Meta e integração específica; o GET só retorna o `hub.challenge`, não dá acesso a dados.

## 4. Estratégia de compatibilidade (sem downtime na Central)

Implementar em **3 fases**, mantendo fallback ao secret global enquanto a Central não for migrada.

### Fase 1 — Aditiva (sem remover nada)
1. Migration cosmética: nenhum schema novo (usamos `connected_account` JSONB existente).
2. Edge `meta-whatsapp-connect`:
   - Aceita novos campos obrigatórios `appSecret` e `verifyToken` no body.
   - Criptografa e grava em `connected_account.app_secret_encrypted` / `verify_token_encrypted`.
   - Continua usando esses valores para `appsecret_proof` na validação Graph; fallback ao global se não vier (transição).
3. Edge `meta-whatsapp-send`, `meta-whatsapp-verify`:
   - Tentam ler `app_secret_encrypted` da integração; se ausente, caem no `Deno.env.get("META_WHATSAPP_APP_SECRET")` (compat Central).
4. Edge `meta-whatsapp-webhook`:
   - POST: novo fluxo "peek -> lookup endpoint -> per-integration secret -> validar". **Se a integração não tiver `app_secret_encrypted`**, valida com o secret global (compat Central).
   - GET: aceita match com qualquer `verify_token_encrypted` ativo OU com o `META_WHATSAPP_VERIFY_TOKEN` global.
5. UI:
   - `MetaWhatsAppCloudDialog`: adiciona campos **App Secret** e **Verify Token** (com toggle mostrar/ocultar), pré-preenchidos vazios; obrigatórios para novas conexões, opcionais ao editar uma já conectada.
   - `MetaWhatsAppPlatformConfig` (admin): marca como **deprecated** com aviso, mas continua mostrando o status global enquanto houver integrações dependendo dele.

> Resultado da Fase 1: Central continua funcionando sem alteração nenhuma. Viagi pode ser conectada com seu próprio App.

### Fase 2 — Migração da Central
1. Editar a integração da Central pela própria UI e preencher App Secret + Verify Token do App da Central (mesmos valores hoje guardados como secret global).
2. Confirmar via `meta-whatsapp-verify` que `appsecret_proof` continua válido.
3. Disparar uma mensagem de teste (texto + áudio) e um inbound real para validar webhook usando o secret per-integration.

### Fase 3 — Remoção do global
1. Marcar a função `meta-whatsapp-platform-status` e a tela `MetaWhatsAppPlatformConfig` para remoção.
2. Remover fallback ao `Deno.env.get` nos 4 edges; passar a exigir credenciais per-integration.
3. Limpar `META_WHATSAPP_APP_SECRET` e `META_WHATSAPP_VERIFY_TOKEN` da lista de secrets do projeto (depois de confirmar produção saudável por ~48h).

## 5. Considerações de segurança
- Os dois novos campos vão criptografados com `encryptSecret` (AES-GCM, mesma chave já em uso).
- Nunca retornados ao frontend; o dialog só mostra placeholder ("••• configurado") quando já existe.
- Para rotação, o usuário substitui o valor → reencriptado e regravado.
- Logs do webhook continuam não imprimindo valores; apenas `signature_match`, `phone_number_id` e `integration_id`.

## 6. Pontos de teste obrigatórios antes da Fase 3
- Central: GET handshake, POST inbound texto, POST inbound áudio, envio outbound texto, envio outbound áudio/imagem/documento.
- Viagi: mesmo conjunto, com App Meta diferente.
- POST com `phone_number_id` desconhecido → 401/200 silencioso, sem efeito.
- POST com assinatura inválida usando App Secret de outra integração → rejeitado.

## 7. Entregáveis desta proposta (quando aprovada — fase 1 primeiro)
- `MetaWhatsAppCloudDialog.tsx`: adicionar inputs e mutation atualizada.
- `meta-whatsapp-connect/index.ts`: aceitar/persistir `appSecret` e `verifyToken`.
- `meta-whatsapp-webhook/index.ts`: refator do fluxo de validação descrito na seção 3, com fallback global.
- `meta-whatsapp-send/index.ts` e `meta-whatsapp-verify/index.ts`: ler `app_secret_encrypted` da integração, fallback global.
- Sem mudança de schema, sem migration.

Aguardo aprovação para iniciar pela **Fase 1**.
