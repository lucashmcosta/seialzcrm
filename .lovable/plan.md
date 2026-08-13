# Fase 3 — WhatsApp Comercial como camada operacional multi-provider

Objetivo: uma única tela operacional (Configurações > Integrações > WhatsApp Comercial) para administrar os números Comerciais de Meta Cloud, Twilio e Evolution, mantendo a separação **Integração (credencial) ≠ Configuração (números/linhas) ≠ Regra (Route/resolver)** e sem duplicar nada que já existe.

## Mapa do que já existe (inspeção feita antes do plano)

Integração (credencial do provider) — permanece onde está:
- Meta Cloud: `MetaWhatsAppCloudDialog` + `MetaWabasSection`, `AddMetaWabaDialog`, `AddMetaWhatsAppNumberDialog`, `MetaAdditionalEndpointsSection`, `MigrateEndpointDialog`; hooks `useMetaConnection`, `useMetaMultiWabaFlag`; functions `meta-whatsapp-connect/verify/disconnect/send/webhook/templates-*`.
- Twilio: `TwilioNumberManagement`, `WhatsAppIntegrationStatus`, `WhatsAppInboundSettings`; functions `twilio-whatsapp-setup/send/webhook/templates`.
- Evolution: `EvolutionWhatsAppDialog` (tenant) e `src/pages/admin/AdminEvolution.tsx` (plataforma); hook `useEvolutionInstances`; functions `evolution-instance-manager` (create/connect/logout/delete/connectionState/webhookFind/webhookSet), `evolution-webhook`, `evolution-whatsapp-send`, `evolution-health-check`; `_shared/evolution/*` (client + provider + state).
- Endpoints/linhas: `AddWhatsAppEndpointDialog`, `AdditionalEndpointsSection`, `EndpointInboundSettings`, hooks `useOrgWhatsAppEndpoints`, `useEndpointNumbers`, `useActiveWhatsAppProviders`.
- Regra: `useSalesRouteConfig` / `useSalesRoute` (leitura de Route), `salesReplyRoute.ts` + `dispatchWhatsAppSend.ts` (pipeline único de envio), resolver V2 no backend.

Schema (verificado): `communication_endpoints`, `messaging_lines` (`active_endpoint_id`, `inbox_key`, `route_slug`), `messaging_line_endpoints` (`is_active`, `linked_at`, `unlinked_at`), `messaging_line_rotations` (`from_endpoint_id`, `to_endpoint_id`, `reason`, `rotated_by_user_id`, `rotated_at`) e `evolution_instances`. Flags `evolution_api_enabled` e `conv_route_resolver_v2` estão ON apenas para a Viagi.

Conclusão: **nenhuma migração é necessária** — o histórico de troca de número já tem tabela própria e todos os vínculos existem.

## O que será construído

### 1. Camada de adapters (backend, provider-agnostic)
Novo `_shared/whatsapp-provider/` com a interface `ProviderConnectionAdapter` e capacidades declaradas:

```text
EvolutionAdapter  qr=true  restart=true  disconnect=true  reconnect=true
MetaAdapter       qr=false restart=false verifyNumber=true verifyWebhook=true
TwilioAdapter     qr=false restart=false verifyNumber=true verifyWebhook=true
```
Cada adapter apenas **delega** para a camada específica já existente do provider (Evolution client, Meta verify, Twilio setup). Nenhuma credencial nova, nenhum manager universal.

### 2. Nova Edge Function `sales-route-operations`
JWT obrigatório + validação de `organization_id` em toda operação. Operações:
- `status` — status real por endpoint, cruzando fonte técnica do provider com `communication_endpoints`/`evolution_instances`; retorna estado normalizado (Conectado / Conectando / QR necessário / Desconectado / Desconhecido) e a flag de **divergência**.
- `provisionEndpoint` — cria/atualiza `communication_endpoints` e vincula em `messaging_line_endpoints` (Evolution: só depois de `Connected` real).
- `setActiveEndpoint` — valida (org, pertence à Route, ativo, provider operacional, elegível para envio) e então atualiza somente `messaging_lines.active_endpoint_id`, registrando a troca em `messaging_line_rotations` (autor + motivo). Não cria Route, não apaga histórico.
- `diagnose` — checklist PASS/FAIL: integração, credenciais, webhook, endpoint, status real, Route, vínculo, endpoint ativo, resolver, + info de última inbound/outbound.
- `testConnection` — status/latência/versão/sessão do provider, sem enviar mensagem.

### 3. `evolution-instance-manager`: apenas `restart` e `serverInfo`
Adições mínimas mantendo JWT, flag, rate limit e validação de nome de instância. Nada de lógica de Route dentro dele.

### 4. Teste de envio
Reutiliza o pipeline Comercial existente (`dispatchWhatsAppSend` → resolver/dispatcher). Mostra rota resolvida, endpoint usado, provider e o resultado (aceito/enviado/erro). Nunca chama o provider direto.

### 5. Tela WhatsApp Comercial (provider-agnostic)
- **A. Status geral**: Route, número ativo, provider, conexão real, modo de roteamento, status geral, com aviso de divergência quando CRM e provider discordarem.
- **B. Números/Endpoints**: tabela número · provider · status real · Route · ativo/histórico · ações (ações filtradas pelas capabilities do adapter).
- **C. Novo número**: wizard começando pela escolha do provider. Se a integração do provider não estiver configurada, mostra "X ainda não configurado" + botão que abre a **tela de integração existente**. Evolution: cria instância → QR no CRM → aguarda Connected real → provisiona endpoint → vincula à Route → pergunta "tornar ativo?" Meta/Twilio: lista números já configurados, valida, provisiona endpoint, vincula, opcionalmente torna ativo — sem pedir credenciais de novo.
- **D. Operações**: Reconectar/Restart/Disconnect (Evolution), Testar conexão, Testar envio, Executar diagnóstico, Tornar ativo, histórico de números (datas, autor, motivo) lido de `messaging_line_rotations`.
- Refresh automático de estado; shadcn; linguagem de negócio (sem UUID, JSON ou termos internos); responsivo.

## Não será tocado
Atendimento, Mobile, resolver V2, trigger de canonicidade, merge/unmerge e a flag `conv_route_resolver_v2`. As telas de integração de Meta/Twilio/Evolution continuam sendo a única fonte de credencial — a nova tela apenas orquestra e faz o link para elas.

## QA e limites do ambiente
Ao final entrego: mapa do que existia, o que foi reutilizado, o que foi criado, arquivos alterados, APIs por provider, checklist QA PASS/FAIL e bugs corrigidos. Build/typecheck/console eu valido aqui. Já os passos que dependem de sessão autenticada e de escanear QR real (conectar WhatsApp, envio de teste, inbound) precisam do seu clique no preview logado — o sandbox não tem sessão neste projeto (Supabase externo).
