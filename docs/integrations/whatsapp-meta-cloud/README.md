# WhatsApp — Meta Cloud API

**Referência técnica completa:** `docs/audit/04-integracoes/whatsapp-meta-cloud.md` e `docs/audit/02-edge-functions/meta-whatsapp-*`.

## Finalidade
Canal WhatsApp oficial via Meta Cloud API — envio, templates e recepção.

## Autenticação
- Credenciais por org em `organization_integrations` (JSONB cifrado via `_shared/crypto.ts`).
- Catálogo global em `admin_integrations` (App IDs).
- Onboarding: `meta-whatsapp-connect` (valida token/phone_number_id via `_shared/meta-graph.ts`), `meta-whatsapp-verify`.
- Desconectar: `meta-whatsapp-disconnect`.

## Embedded Signup (app da plataforma)
Conexão sem copiar tokens: o cliente escolhe ou cria a WABA e o número no popup oficial da Meta (Embedded Signup **v4**; v2/v3 foram descontinuados em 15/10/2026). O modo manual continua disponível para orgs com App Meta próprio.

- **Frontend:** `MetaWhatsAppEmbeddedSignup.tsx`, que aparece no dialog do WhatsApp só em nova conexão. Fluxo: `meta-connect-intent` → `FB.login(whatsapp_config_id, extras: { setup: {} })` + evento `WA_EMBEDDED_SIGNUP` (origem validada por hostname `*.facebook.com`) → `meta-whatsapp-embedded-signup`.
- **Backend:** `meta-whatsapp-embedded-signup`, com as regras puras em `_shared/meta-whatsapp/embedded-signup.ts`:
  1. Consome o intent one-time.
  2. Troca o `code` por business token.
  3. Aceita só a WABA presente nos `granular_scopes.target_ids` do token. O session info do navegador é só uma dica.
  4. Valida o número ∈ WABA.
  5. Inscreve o app na WABA (`subscribed_apps`). Se falhar, aborta antes de gravar.
  6. Registra o número na Cloud API se ainda não estiver, com PIN 2FA aleatório cifrado em `connected_account.two_step_pin_encrypted`. Se o registro falhar, a conexão não é bloqueada.
  7. Grava `organization_integrations` (`meta_waba_id`, `connected_account.source = 'embedded_signup'`) e `communication_endpoints`.
  8. Vincula a rota via `provision_line_endpoint`.
- **Idempotência / conflitos:**
  - Mesma WABA já conectada por Embedded Signup → re-autoriza no lugar.
  - WABA conectada manualmente → `409 waba_connected_manually`, sem trocar o app dono do webhook em silêncio.
  - Número em outra org ou em outro provider → 409.
  - Outra WABA na org sem a flag `meta_multi_waba` → `409 another_waba_connected`.
- **Webhook/envio:** ambos leem `connected_account` (`resolveMetaCredentials`), onde fica o business token, que não expira.
  - **App secret:** linhas com `source = 'embedded_signup'` leem o `FACEBOOK_APP_SECRET` do env em tempo de execução (`platformAppSecretFor`), sem cópia no banco. Rotacionar o secret não exige reconectar ninguém.
  - **Verify token:** o handshake usa só `META_WA_WEBHOOK_VERIFY_TOKEN`.
  - **Integrações de app próprio** (`source` nulo ou `add_waba`): seguem o caminho anterior, sem mudança.
  - **Quando reconectar é inevitável:** só se o cliente remover o acesso do app Seialz no Business Manager dele.

### Configuração (uma vez, app Seialz `1866027811023327`)
1. **App Dashboard → Facebook Login for Business → Configurations:** criar uma configuração do tipo **WhatsApp Embedded Signup** com `whatsapp_business_management` + `whatsapp_business_messaging` e o ativo "Contas do WhatsApp". Salvar o ID em `FACEBOOK_WA_CONFIG_ID`. Não alterar `FACEBOOK_CONFIG_ID`, que é de Ads/Leads.
2. **Facebook Login for Business → Settings:** o domínio do app em *Allowed domains* e *Valid OAuth redirect URIs* (HTTPS).
3. **WhatsApp → Configuration → Webhook:** callback `https://<project>.supabase.co/functions/v1/meta-whatsapp-webhook`, verify token = secret `META_WA_WEBHOOK_VERIFY_TOKEN`. Assinar `messages` e `account_update`. O handshake aceita esse secret além dos verify tokens por integração.
4. **Secrets Supabase:** `FACEBOOK_WA_CONFIG_ID`, `META_WA_WEBHOOK_VERIFY_TOKEN`. `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` já existem.
5. **Live mode:** só aparecem no popup as permissões com Advanced Access (App Review / Tech Provider). Em modo dev, só para quem tem papel no app.
6. **Cobrança:** o cliente adiciona a forma de pagamento no WhatsApp Manager.

## Webhooks
- Endpoint: edge function `meta-whatsapp-webhook`.
- Verificação Meta com `hub.verify_token`.
- Resolve org via `waba_id` → `communication_endpoints`.
- Cross-org routing: quando várias orgs compartilham WABA/phone_number_id, a org destino é resolvida pelo identificador do canal antes de qualquer gravação (mesmo princípio do canal Twilio).

## Envio
- `meta-whatsapp-send` — chamada por `dispatchWhatsAppSend`.
- Política global, para todas as organizações e todos os números Meta Cloud: mensagens de texto solicitam a prévia de links com `text.preview_url: true`; o corpo deve conter a URL com `http://` ou `https://`. Não existe exceção por número nem configuração por tenant. Referência: [objeto de texto da Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/TextObject/).
- A política cobre texto livre permitido pela janela de atendimento. Templates e anexos mantêm seus formatos próprios; não recebem `text.preview_url`. A integração Twilio usa a prévia automática do provedor, conforme seu [guia](../whatsapp-twilio/README.md).
- Templates: `meta-whatsapp-templates-create`, `meta-whatsapp-templates-sync`.

## Diagnósticos
- `meta-wa-diagnose` — checagem de saúde da integração.
- Priorização de sender outbound: prefere senders online; se o número estiver offline, cai para o próximo válido (`src/lib/dispatchWhatsAppSend.ts`).

## Falhas comuns
- Token expirado → renovar em Settings → Integrations.
- Phone number não registrado no WABA → verificar dashboard Meta.
- Rate limit Meta (429) → back-off exponencial.
- Janela 24h fechada → só templates aprovados podem ser enviados.

## Rate limits
Definidos pela tier Meta do WABA. Não gerenciamos localmente.
