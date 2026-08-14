# Auditoria de Configurações > Integrações + plano arquitetural (nada implementado)

Auditoria feita em leitura apenas (código + banco de produção). Nenhuma alteração de dados, flag, Route, número ou integração foi feita.

## Parte 1 — Onde vive cada integração hoje

Modelo em duas camadas: catálogo global `admin_integrations` (16 slugs: `meta`, `meta-whatsapp-cloud`, `meta-lead-ads`, `meta-capi`, `twilio-whatsapp`, `twilio-voice`, `evolution-whatsapp`, `kommo`, `nammux`, `suvsign`, `zapier`, `ai-byok`, `openai-gpt`, `claude-ai`, `google-gemini`, `elevenlabs`) + conexões por org em `organization_integrations` (credenciais em `config_values` JSONB, cifradas por `_shared/crypto.ts`). Números/canais concretos ficam em `communication_endpoints`; agrupamento por Route em `messaging_lines` + `messaging_line_endpoints` + `messaging_line_rotations`.

| Provider | Credenciais | Tela | Edge Functions | RPC/serviço |
|---|---|---|---|---|
| Meta Cloud API (WhatsApp) | `organization_integrations.config_values` (app_id, waba_id, phone_number_id, system user token, app secret, verify token — cifrados) + `organization_integrations.meta_waba_id`/`meta_credentials_id` + `meta_connection_credentials`; env `META_GRAPH_API_VERSION`, `META_TOKEN_ENCRYPTION_KEY`, `META_SYNC_TRIGGER_TOKEN` | `MetaWhatsAppCloudDialog` (+ `MetaWabasSection`, `MetaAdditionalEndpointsSection`, `AddMetaWhatsAppNumberDialog`, `AddMetaWabaDialog`, `MigrateEndpointDialog`, `WhatsAppInboundSettings`) | `meta-whatsapp-connect`, `-verify`, `-disconnect`, `-send`, `-webhook`, `-templates-sync`, `-templates-create`, `meta-wa-diagnose` | `src/services/metaWhatsAppService.ts`; templates em `whatsapp_templates`/`whatsapp_template_actions` |
| Evolution API | `EVOLUTION_BASE_URL`, `EVOLUTION_GLOBAL_API_KEY`, `EVOLUTION_WEBHOOK_SECRET` (secrets globais, não por org) + `evolution_instances` (instance_name, instance_id_remote, last_known_state, last_state_checked_at, last_qr_expires_at, owner_jid, owner_number_digits, endpoint_id) | `EvolutionWhatsAppDialog`, `SalesWhatsAppSettingsSection`, `SalesWhatsAppConnectDialog` | `evolution-instance-manager`, `evolution-webhook`, `evolution-whatsapp-send`, `evolution-health-check`, `sales-route-operations` | `provision_sales_endpoint`, `rotate_messaging_line_endpoint`; flag `evolution_api_enabled` |
| Twilio WhatsApp | `organization_integrations.config_values` (account_sid, auth_token, whatsapp_from, messaging_service_sid); env `TWILIO_WEBHOOK_PUBLIC_BASE_URL`, `TWILIO_SIGNATURE_ENFORCE` | `IntegrationConnectDialog`/`IntegrationDetailDialog` genéricos + `WhatsAppIntegrationStatus`, `TwilioNumberManagement` | `twilio-whatsapp-setup`, `-send`, `-webhook`, `-templates` | `resolve_communication_endpoint` |
| Twilio Voice | mesmas credenciais Twilio em `organization_integrations` + `organization_phone_numbers`, `organization_phone_number_users`, `telephony_*` | `PhoneNumberSettings`, `TelephonyAvailabilitySettings` | `twilio-setup`, `twilio-token`, `twilio-call`, `twilio-webhook`, `telephony-*` | flags `telephony_v2`, `telephony_transfer_v1` |
| Meta Business / Lead Ads / CAPI | `meta_connections`, `meta_connection_credentials`, `meta_app_credentials`, `meta_assets`, `meta_lead_pages`, `capi_event_log`; env `FACEBOOK_APP_ID/SECRET/CONFIG_ID` | `MetaIntegrationPage`, `MetaLeadAdsDialog`, `MetaCapiDialog`, `CanonicalCredentialPanel` | `meta-connect*`, `meta-lead-ads-*`, `meta-capi-*`, `marketing-*` | — |
| Instagram / Facebook (orgânico + social inbox) | reutiliza `meta_connections`/`meta_assets`; tabelas `social_conversations`, `social_messages` | sem tela dedicada em Integrações | `social-inbox`, `social-webhook`, `meta-organic-sync`, `marketing-page-webhooks` | parcialmente sem UI |
| Telegram | **não existe** (nenhuma tabela, function, slug ou UI) | — | — | — |
| Email | **não existe** como canal (só e-mails transacionais de auth) | — | — | — |
| Webchat (Seialz) | endpoints `provider='seialz'` | `WebchatSettings`, `WebchatFlowBuilder` | `webchat-*` | — |
| Kommo / Nammux / SuvSign / BYOK IA | `organization_integrations`, `nammux_integration_credentials`, `organization_api_keys`; `VOYAGE_API_KEY`, `LOVABLE_API_KEY` | dialogs próprios + `AIProvidersSettings` | `kommo-*`, `nammux-*`, `suvsign-webhook`, `byok-*` | — |

## Parte 2 — Como um número Meta é adicionado hoje (e por que você não acha)

Fluxo existente: `MetaWhatsAppCloudDialog` → botão "+ Adicionar número desta WABA" → `AddMetaWhatsAppNumberDialog` → `metaWhatsAppService.connect({ mode: 'additional', endpointPurpose })` → edge `meta-whatsapp-connect` reaproveita token/app secret já cifrados, valida na Graph API, cria linha em `communication_endpoints` (`provider='meta_cloud_api'`, `purpose='customer_service'|'commercial'`, `status='online'`). Não há SQL manual; o número no Meta Business Manager continua sendo criado/verificado fora do CRM (dashboard externo), o CRM só registra `phone_number_id`.

Causa raiz do "não encontro onde adicionar": o botão só renderiza quando existe `orgIntegration` resolvido, e `useOrgIntegration` pega **uma única** linha (`order created_at desc limit 1`). Central Trabalhista tem 3 linhas `meta-whatsapp-cloud` (WABA 2206490376764877, WABA 1030817762639158 e uma legada desabilitada) e Viagi tem 3. Ou seja: o card legado se ancora só na WABA mais recente, e a seção multi-WABA (`MetaWabasSection`, flag `meta_multi_waba` ligada globalmente) lista WABAs e números mas **não tem botão de adicionar número por WABA**. Resultado: para as demais WABAs não existe caminho de UI.

Ciclo de vida do número: `purpose` define Comercial vs Atendimento; vínculo à Route via `messaging_line_endpoints` (RPC `provision_sales_endpoint`); virar ativo via `messaging_lines.active_endpoint_id` (RPC `rotate_messaging_line_endpoint`, auditada em `messaging_line_rotations`); sair de ativo = rotação para outro endpoint ou `is_active=false` / `meta-whatsapp-disconnect`.

## Parte 3 — Status falsos: de onde vêm

- `communication_endpoints.status` é **texto persistido**, escrito uma vez em `meta-whatsapp-connect`/`-verify` (`'online'`) e em `-disconnect` (`'offline'`). Nunca reavaliado. Em produção há endpoints com `status='online'` e `updated_at` de 26/06 a 22/07 — a badge reflete o passado, não o presente. Há ainda `status='unknown'` em massa nos números Twilio herdados.
- `MetaAdditionalEndpointsSection` renderiza exatamente `is_active ? (status || 'ativo') : 'inativo'` → é isso que produz "Conectado / Ativo para envio" mesmo sem capacidade de envio.
- Já existe fonte melhor, mas só na tela Comercial: `sales-route-operations/status` devolve `technicalStatus` por endpoint (`CONNECTED`, `QR_REQUIRED`, `IDENTITY_MISMATCH`, `PROVIDER_MANAGED`, …) consultando o provedor; `SalesWhatsAppSettingsSection` já usa. Evolution tem estado real em `evolution_instances.last_known_state` + `owner_jid`; Meta tem `quality_rating`/`current_tier`/`messaging_limit_per_24h` nas colunas do endpoint.

Arquitetura proposta (dois estados independentes):
- **Estado da integração** (por conexão): credenciais válidas / token expirando / webhook inscrito / última validação. Verificações reais: Meta = `GET /{phone_number_id}` + `subscribed_apps`; Twilio = `GET /IncomingPhoneNumbers.json`; Evolution = `instance/connectionState` + `fetchInstances`.
- **Estado do número** (por endpoint): 🟢 Operacional / 🟡 Atenção / 🔴 Offline, derivado só de checagem fresca (Meta: número registrado + qualidade + tier; Evolution: sessão `open` + `owner_jid` casando com o endereço; Twilio: sender existe no Messaging Service). `is_active` passa a ser rotulado apenas como "habilitado no CRM"; nunca como funcionamento.

## Parte 4 — Nova arquitetura de Configurações

Hoje o menu é uma grade plana (`SettingsGrid`) com ~25 itens e Integrações é uma lista de cards com dialogs por slug. Proposta: agrupar em Organização / Usuários / Inbox / Automações / Integrações / IA, e dentro de Integrações agrupar por canal (WhatsApp → Meta, Evolution, Twilio; Voz; Marketing/Meta Business; CRM externo; IA). Cada provider ganha página com abas fixas: Credenciais · Números · Status · Webhooks · Logs · Rotas · Permissões · Teste de conexão.

Já existe no backend (só falta expor de forma uniforme): status técnico real (`sales-route-operations`), diagnóstico Meta (`meta-wa-diagnose`), health Evolution (`evolution-health-check`), reinscrição de webhook Meta, logs (`integration_audit_logs`, `integration_inbound_events`, `integration_inbound_ingest_errors`, `service-events`), Rotas (`messaging_lines*`), permissões usuário↔número (`user_reply_endpoints`).
Falta implementar: teste de conexão uniforme por provider, aba de números para **toda** WABA, estado do número recalculado, painel de webhooks para Twilio/Evolution, canais Email/Instagram/Facebook/Telegram (Telegram e Email não existem).

## Parte 5 — Classificação de risco

🟢 Front-end/UX: reagrupar `SettingsGrid`; renomear badges (`is_active` → "Habilitado no CRM"); esconder `status` persistido; abas por provider; textos e estados vazios.
🟡 Backend sem risco: endpoint de "status do número" só-leitura por provider; teste de conexão; expor logs/diagnósticos já existentes; corrigir `useOrgIntegration` para listar todas as WABAs e permitir "adicionar número" por WABA (leitura + reuso da function já existente).
🟠 Exige migração: colunas de saúde observada (`last_health_check_at`, `health_state`, `health_reason`) em `communication_endpoints`; job periódico de health; nova tabela de histórico de status.
🔴 Alto risco (não tocar sem GMUD dedicada): qualquer mudança em `active_endpoint_id`, rotação, `purpose`, resolver V2, webhooks da Central, ou remoção da coluna `status` legada.

## Parte 6 — Sequência acordada

1. Reorganizar Configurações > Integrações (🟢/🟡, sem migração).
2. Corrigir status falsos (🟡 leitura, depois 🟠 se quisermos persistir health).
3. Concluir switch "Responder por" (flag `sales_manual_reply_endpoint_v1`, hoje só Viagi).
4. Validar na Viagi com número realmente operacional.
5. Só então Central: ativação por org via flag, sem troca automática de endpoint, rollback = desligar flag, zero downtime, nenhuma alteração de comportamento fora de flag.

## Estado verificado agora (produção)

- Flags: `conv_route_resolver_v2`, `sales_manual_reply_endpoint_v1`, `evolution_api_enabled`, `telephony_v2`, `telephony_transfer_v1` → apenas Viagi; `meta_multi_waba` → global.
- Central Trabalhista: 3 conexões Meta (2 ativas), endpoints Comercial `+551150287067` e Atendimento `+551150287027` com `status='online'` persistido desde julho.
- Nenhuma alteração pendente deste plano toca Central, Routes, números ou flags.

## Próximo passo proposto

Aprovar apenas a Etapa 1 (🟢/🟡): reorganização visual de Configurações > Integrações + caminho de "adicionar número" para todas as WABAs + separação visual entre estado da integração e estado do número (sem novo health job, sem migração).
