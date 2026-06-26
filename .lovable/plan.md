# Meta WhatsApp Cloud API — MVP (plano final com separação tenant × plataforma)

## Localização das duas configurações

| Camada | Rota | Quem acessa | O que configura |
|---|---|---|---|
| **Tenant (organização)** | `/settings/integrations` → card **Meta WhatsApp Cloud** → **Ver integração** | Qualquer usuário da org com permissão de integrações | App ID, WABA ID, Phone Number ID, E.164, System User Token |
| **Plataforma (global)** | `/admin/integrations/meta-whatsapp-cloud` (`AdminIntegrationDetail` + `AdminProtectedRoute`) | Apenas admin/superadmin Seialz | `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN` |

A rota admin já existe — adiciono apenas uma aba "Configuração da Plataforma" dentro de `AdminIntegrationDetail.tsx` que aparece somente quando `slug === 'meta-whatsapp-cloud'`.

## 1. Tela admin (plataforma)

`/admin/integrations/meta-whatsapp-cloud` → aba **Configuração da Plataforma**:

- Campo **App Secret** — placeholder mostra `••••••• Configurado` ou `Não configurado`; nunca exibe o valor real.
- Campo **Verify Token** — idem.
- Botão **Atualizar secrets globais** → edge `admin-platform-secrets-set` (verify_jwt + checa `admin_users`) que escreve via Supabase Management API nos secrets `META_WHATSAPP_APP_SECRET` e `META_WHATSAPP_VERIFY_TOKEN`.
- Botão **Status** → edge `meta-whatsapp-platform-status` (público, retorna apenas booleanos) → `{ appSecretConfigured, verifyTokenConfigured, webhookActive }`. Usado tanto pelo admin quanto pelo modal da organização.

Nenhum valor de secret trafega pro front. O front só recebe booleans.

## 2. Tela tenant (organização)

`MetaWhatsAppCloudDialog` com duas seções:

### Seção "Dados do número" (editável)
- App ID
- WABA ID
- Phone Number ID
- E.164 (com `PhoneInput`)
- System User Token (password input, criptografado server-side)
- Botão **Conectar** → edge `meta-whatsapp-connect`

### Seção "Status da plataforma" (read-only, alimentada por `meta-whatsapp-platform-status`)
- App Secret global: **Configurado** / **Pendente**
- Verify Token global: **Configurado** / **Pendente**
- Webhook: **Ativo** / **Pendente de configuração global**
- Banner explicativo quando algo falta:
  > "Configuração global da Meta WhatsApp Cloud pendente. O envio pode ser configurado, mas o recebimento de mensagens e callbacks só serão ativados após a configuração global da plataforma."

Quando conectado, vira `ConnectedPanel` com Identidade / Saúde / Tráfego / Ações (Verificar / Desconectar).

## 3. Webhook em dois estados

`meta-whatsapp-webhook` (verify_jwt=false):

**Pendente** — quando `META_WHATSAPP_VERIFY_TOKEN` e/ou `META_WHATSAPP_APP_SECRET` ausentes:
- GET retorna `503` com `{status:'pending_global_config'}`
- POST retorna `503` idem
- Não derruba o restante; UI/outbound continuam testáveis

**Ativo** — secrets globais presentes:
- GET valida `hub.verify_token` contra `META_WHATSAPP_VERIFY_TOKEN`
- POST valida `X-Hub-Signature-256` com `META_WHATSAPP_APP_SECRET`
- Resolve endpoint por `phone_number_id` (= `sender_sid` + `provider='meta-cloud'`)
- Processa `messages[]` e `statuses[]`

`meta-whatsapp-platform-status` reflete esses estados pra UI.

## 4. Dispatcher único (mantido do plano anterior)

- `src/lib/dispatchWhatsAppSend.ts` (cliente)
- `supabase/functions/_shared/dispatch-whatsapp-send.ts` (server)
- Regra ESLint `no-restricted-syntax` bloqueia `supabase.functions.invoke('twilio-whatsapp-send'|'meta-whatsapp-send')` fora dos dispatchers.
- 11 call-sites front + 4 server migrados.
- `twilio-whatsapp-send`/`twilio-whatsapp-webhook` intocados; `provider NULL` legado é tratado como Twilio porque o DEFAULT da coluna fixa Twilio.

## 5. Migration mínima

1. `INSERT` em `admin_integrations` do slug `meta-whatsapp-cloud` (category=communication, status=available, com metadata indicando que possui secrets globais).
2. `ALTER TABLE communication_endpoints ADD COLUMN provider text NOT NULL DEFAULT 'twilio'` — **DEFAULT permanece**.
3. `CHECK (provider IN ('twilio','meta-cloud'))`.
4. `CREATE INDEX ... ON communication_endpoints (sender_sid) WHERE provider='meta-cloud'`.

Sem mexer em `meta`, `meta-capi`, `meta-lead-ads`.

## 6. Edge functions criadas

- `meta-whatsapp-connect` — valida (Zod + 3 chamadas Graph) e persiste org+endpoint.
- `meta-whatsapp-disconnect` — desativa endpoint + remove integration.
- `meta-whatsapp-verify` — checa phone_number_id na Graph + subscription do webhook.
- `meta-whatsapp-send` — POST texto em `/v23.0/{phone_number_id}/messages`. Mesmo shape do Twilio.
- `meta-whatsapp-webhook` — verify_jwt=false, estrutura completa com modo pendente/ativo.
- `meta-whatsapp-platform-status` — público, retorna booleans (`appSecretConfigured`, `verifyTokenConfigured`, `webhookActive`). Consumido por admin e tenant.
- `admin-platform-secrets-set` — verify_jwt=true + guarda `admin_users`. Usa Supabase Management API para gravar `META_WHATSAPP_APP_SECRET`/`META_WHATSAPP_VERIFY_TOKEN`. Requer secret `SUPABASE_MANAGEMENT_TOKEN` (peço ao usuário no ato da implementação, somente se ele optar por configurar pela UI; alternativa é via `add_secret` direto pela Lovable).

   > Se preferir, no MVP os secrets globais podem ser configurados diretamente pela tela de secrets da Lovable, e a aba admin mostra apenas status (`Configurado / Pendente`) — sem necessidade de `SUPABASE_MANAGEMENT_TOKEN`. Default: status-only.

## 7. Service layer

`src/services/metaWhatsAppService.ts`:
- `getPlatformStatus()` → `meta-whatsapp-platform-status`
- `validateAndConnect(formData)` → `meta-whatsapp-connect`
- `disconnect()`, `verifyWebhook()`, `getStatus()`

`MetaWhatsAppCloudDialog` puro de UI.

## 8. Dados → destino

| Dado | Destino |
|---|---|
| App ID (tenant) | `organization_integrations.config_values.app_id` |
| WABA ID (tenant) | `communication_endpoints.external_account_id` + `config_values.waba_id` |
| Phone Number ID (tenant) | `communication_endpoints.sender_sid` + `config_values.phone_number_id` |
| E.164 (tenant) | `communication_endpoints.external_address` |
| System User Token (tenant) | `connected_account.access_token_encrypted` via `encryptSecret` |
| **App Secret (global)** | secret `META_WHATSAPP_APP_SECRET` |
| **Verify Token (global)** | secret `META_WHATSAPP_VERIFY_TOKEN` |

## 9. Ordem de execução

1. Migration (slug + coluna provider + check + index).
2. `_shared/meta-whatsapp/*` (graph, validate, persist, status).
3. Edges: `meta-whatsapp-platform-status` → `meta-whatsapp-connect` → `meta-whatsapp-send` → `meta-whatsapp-webhook` (com modo pendente) → `meta-whatsapp-disconnect` → `meta-whatsapp-verify`.
4. `metaWhatsAppService.ts` + `MetaWhatsAppCloudDialog` (ConnectForm + StatusPanel + ConnectedPanel) + registro no `IntegrationsSettings`.
5. Aba "Configuração da Plataforma" em `AdminIntegrationDetail.tsx` quando `slug === 'meta-whatsapp-cloud'` (status-only).
6. Dispatcher cliente + server + migração dos 15 call-sites + regra ESLint.
7. Smoke test E2E (sem secrets globais ainda): conectar → enviar dentro da janela 24h funciona; webhook retorna pendente.
8. Quando o usuário fornecer App Secret/Verify Token via `add_secret`, webhook entra automaticamente em modo ativo — nenhum redeploy necessário.

## 10. Plano de teste

- Sem secrets globais: UI mostra "Pendente"; conectar funciona; `meta-whatsapp-send` entrega; webhook responde 503 pendente.
- Com secrets globais: UI mostra "Ativo"; webhook GET valida verify_token; POST valida assinatura; mensagens inbound criam thread.
- Twilio inalterado (18 endpoints existentes).
- `bun run lint` falha se algum código chamar `twilio-whatsapp-send`/`meta-whatsapp-send` fora do dispatcher.
