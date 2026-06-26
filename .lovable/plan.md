# Meta WhatsApp Cloud API — MVP (plano final aprovado)

## Ajustes finais incorporados

1. **`communication_endpoints.provider`**: `NOT NULL DEFAULT 'twilio'`, e o **DEFAULT permanece** após a migration. Endpoints legados, seeds, imports, jobs e telas antigas continuam funcionando sem precisar declarar provider. Apenas o fluxo Meta envia `provider='meta-cloud'` explicitamente.
2. **Acesso aos envios é exclusivo via dispatcher.** Nenhum código (novo ou existente) chama `twilio-whatsapp-send` ou `meta-whatsapp-send` diretamente. Toda chamada passa por:
   - `src/lib/dispatchWhatsAppSend.ts` (cliente)
   - `supabase/functions/_shared/dispatch-whatsapp-send.ts` (server)

   Para travar isso, adiciono regra de lint:
   ```js
   // eslint.config.js — bloqueia invokes diretos
   'no-restricted-syntax': ['error', {
     selector: "CallExpression[callee.property.name='invoke'][arguments.0.value=/whatsapp-send$/]",
     message: 'Use dispatchWhatsAppSend em vez de invocar o provider diretamente.'
   }]
   ```
   Os arquivos de dispatcher ficam fora dessa regra via override. Em docs (`ApiDocs.tsx`) o nome aparece só como string informativa — sem invoke real, não dispara.

## Arquitetura final

```text
UI (Settings → Integrações → card Meta WhatsApp Cloud)
        │
        ▼
MetaWhatsAppCloudDialog  (apresentação pura)
        │
        ▼
src/services/metaWhatsAppService.ts   ← ciclo de vida da integração
        ├── validateCredentials() / connect() / disconnect()
        ├── verifyWebhook() / getStatus()
        └── invoca apenas as edges meta-whatsapp-connect/disconnect/verify

ENVIO DE MENSAGEM (qualquer origem):
src/lib/dispatchWhatsAppSend.ts                       ← único ponto no cliente
supabase/functions/_shared/dispatch-whatsapp-send.ts  ← único ponto no server
        │
        ├── endpoint.provider === 'meta-cloud' → meta-whatsapp-send
        └── endpoint.provider === 'twilio'     → twilio-whatsapp-send (inalterado)
```

Composer, Inbox, AI Agent, Scheduled Messages, ContactMessages, Mobile, Lead Ads — todos chamam só o dispatcher. Adicionar Gupshup/Evolution/360Dialog amanhã = mexer só no dispatcher + CHECK constraint.

## Migration mínima

1. `INSERT` em `admin_integrations` do slug **`meta-whatsapp-cloud`** (category=communication, status=available).
2. `ALTER TABLE communication_endpoints ADD COLUMN provider text NOT NULL DEFAULT 'twilio'` — **DEFAULT mantido**.
3. `ALTER TABLE communication_endpoints ADD CONSTRAINT communication_endpoints_provider_check CHECK (provider IN ('twilio','meta-cloud'))`.
4. `CREATE INDEX ... ON communication_endpoints (sender_sid) WHERE provider='meta-cloud'` — lookup do webhook por `phone_number_id`.

Sem alterações em `meta`, `meta-capi`, `meta-lead-ads` ou em `twilio-whatsapp-send`/`twilio-whatsapp-webhook`.

## Camada de serviço (`metaWhatsAppService.ts`)

Encapsula todo ciclo de vida. Dialog é casca visual. Embedded Signup futuro substitui apenas o `ConnectForm`; service, banco, dispatcher e edges não mudam.

Edges pequenas e focadas:

- `meta-whatsapp-connect` — valida payload (Zod) + 3 chamadas Graph (`/{phone_number_id}`, `/{waba_id}/phone_numbers`, `/debug_token`), criptografa token via `encryptSecret`, cria `organization_integrations` + `communication_endpoints` (`provider='meta-cloud'`). Helpers em `_shared/meta-whatsapp/` (`validate.ts`, `graph.ts`, `persist.ts`).
- `meta-whatsapp-disconnect` — desativa endpoint + remove integration.
- `meta-whatsapp-verify` — checa `phone_number_id` na Graph + subscription do webhook.
- `meta-whatsapp-webhook` (verify_jwt=false) — valida `hub.verify_token` no GET; valida `X-Hub-Signature-256` no POST; processa `messages[]` e `statuses[]`. Roteia por `phone_number_id` (= `sender_sid` + `provider='meta-cloud'`).
- `meta-whatsapp-send` — POST texto em `/v23.0/{phone_number_id}/messages`. Retorna `{success, messageId}` no mesmo shape do Twilio.

## Dados coletados (formulário do MVP)

| Dado | Destino |
|---|---|
| App ID | `organization_integrations.config_values.app_id` |
| WABA ID | `communication_endpoints.external_account_id` + `config_values.waba_id` |
| Phone Number ID | `communication_endpoints.sender_sid` + `config_values.phone_number_id` |
| E.164 | `communication_endpoints.external_address` |
| Permanent System User Token | `connected_account.access_token_encrypted` (via `encryptSecret`) |
| App Secret | secret global `META_WHATSAPP_APP_SECRET` |
| Verify Token | secret global `META_WHATSAPP_VERIFY_TOKEN` |

## Painel da integração (`ConnectedPanel.tsx`)

Estrutura em seções, lê tudo via `metaWhatsAppService.getStatus()`; campos ausentes mostram `—`/skeleton:

- **Identidade**: Provider, Meta App, WABA ID, Phone Number ID, Business Verification
- **Saúde**: Quality Rating, Messaging Tier, Status do Webhook, Última sincronização, Último erro
- **Tráfego**: Última mensagem enviada, Última mensagem recebida
- **Ações**: Verificar Webhook, Desconectar

Pronto para abas futuras (templates, mídia, métricas).

## Ordem de execução

1. `add_secret`: `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`.
2. Migration mínima.
3. `_shared/meta-whatsapp/*` + `meta-whatsapp-connect`.
4. `metaWhatsAppService.ts` + `MetaWhatsAppCloudDialog` + `ConnectForm` + roteamento no `IntegrationsSettings`.
5. `meta-whatsapp-webhook` (configurar no Meta Dashboard depois).
6. `meta-whatsapp-send`.
7. Dispatchers (cliente + server) + substituição dos 11 call-sites front + 4 server + regra de ESLint que trava invokes diretos.
8. `meta-whatsapp-disconnect` + `meta-whatsapp-verify` + `ConnectedPanel`.
9. Teste E2E.

## Plano de teste E2E

- Conectar pela UI com credenciais reais → integration + endpoint criados com `provider='meta-cloud'`.
- Credenciais inválidas → erro claro, nada gravado.
- Enviar do Composer/Inbox/AI Agent/Mobile para número Meta → entrega; para número Twilio → continua funcionando.
- Webhook recebe → thread criada/atualizada; status sent/delivered/read/failed propaga.
- Fora da janela 24h → `131047` exibido.
- Desconectar pela UI → endpoint `is_active=false`, integration removida.
- Lint: `bun run lint` falha se algum código invocar `twilio-whatsapp-send`/`meta-whatsapp-send` diretamente.
- Regressão Twilio: rodar fluxos legados (18 endpoints existentes) e confirmar zero impacto.
