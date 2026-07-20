# Evolution API — UX Final Audit

Data: 2026-07-20
Escopo: ajuste de UX para uso em produção após a entrega técnica (`PRODUCTION_READY_AUDIT.md`).

## Objetivos

1. Atualizar a superfície administrativa (`/admin/evolution`) removendo todo texto de "Fase 4 / inércia" e refletindo o status Production Ready.
2. Disponibilizar aos tenants uma UX de conexão/gestão do WhatsApp Evolution equivalente à das demais integrações (Meta Cloud, Twilio), acessível em Configurações → Integrações.
3. Preservar isolamento multitenant e não expor detalhes de infraestrutura (URLs internas, tokens, IDs remotos) ao cliente final.

## Entregas

### 1. Superfície administrativa (`/admin/evolution`)

- Subtítulo e alerts reescritos: "Superfície administrativa (Production Ready). Provisionamento, troubleshooting e observabilidade das instâncias Evolution. Tenants conectam o WhatsApp pela área de Integrações."
- Removidas as referências a "Fase 4", "FEATURE_DISABLED", "isso é esperado" e "protegido pela feature flag" que sugeriam inércia.
- Comentário topo do arquivo (`src/pages/admin/AdminEvolution.tsx`) reescrito para descrever o papel administrativo definitivo.
- Cards de criação de instância e listagem passam a mencionar apenas o fluxo real: provisionamento pela equipe Seialz + vínculo com `communication_endpoints` durante o onboarding do tenant.
- Sem mudanças funcionais nesta tela: continua restrita a usuários admin (proteção existente via `AdminLayout` + rotas admin).

### 2. Catálogo global (`admin_integrations`)

- Adicionado registro `evolution-whatsapp` (categoria `whatsapp`, `status='available'`) para que a integração apareça no catálogo consumido por Configurações → Integrações.
- Nenhum campo de credencial exposto ao tenant: `config_schema = {}` — as credenciais são globais, injetadas por secret de Edge Function.
- Seed do vínculo `organization_integrations` para a organização piloto Viagi (`b246ef6f-6242-4011-a112-6d8783d2896a`), preservando idempotência (não recria se já existir).

### 3. Dialog do tenant

Arquivo novo: `src/components/integrations/evolution-whatsapp/EvolutionWhatsAppDialog.tsx`.

Padrão visual/UX baseado no `MetaWhatsAppCloudDialog` para consistência com as demais integrações WhatsApp:

- **Status hero**: badge de estado (Conectado / Conectando / Desconectado / QR disponível), número conectado formatado (E.164 → `+55 11 91234-5678`), última sincronização com timestamp relativo em pt-BR.
- **QR Code**: botão "Gerar QR Code" invoca `evolution-instance-manager` (`op: connect`). O QR é apresentado como imagem inline (base64) com instrução passo-a-passo do WhatsApp mobile.
- **Ações operacionais**: Atualizar estado, Atualizar webhook, Health check, Desconectar. Todas roteadas pelo hook existente `useEvolutionManager` (via Edge Function autenticada).
- **Health check**: usa `op: fetch` como probe leve de comunicação com o servidor Evolution; exibe apenas resultado semântico ("✓ Comunicação com o servidor OK" ou "✗ <mensagem>"), sem expor URLs, tokens ou IDs internos.
- **Vazio/erro**: quando o tenant ainda não tem instância provisionada, apresenta alerta orientando contato com o suporte Seialz (sem revelar arquitetura interna) e botão de refresh.
- **Segurança/isolamento**:
  - Todas as leituras usam `useEvolutionInstances` — RLS filtra `organization_id = ANY(current_user_org_ids())`.
  - Filtro adicional em memória por `organization?.id` para blindagem em cenários de múltipla organização por usuário.
  - Nenhum campo de credencial editável na UI; nenhuma exibição de `EVOLUTION_BASE_URL`, `EVOLUTION_GLOBAL_API_KEY`, `instance_id_remote` ou webhook secret.

### 4. Integração ao catálogo (`IntegrationsSettings.tsx`)

- Import do novo `EvolutionWhatsAppDialog`.
- Mapeamento de ícone: `evolution-whatsapp` → `ChatCircle`.
- Slug adicionado às listas de exclusão dos diálogos genéricos (`IntegrationConnectDialog`, `IntegrationDetailDialog`), garantindo que apenas o diálogo especializado seja usado.
- Renderização condicional: `selectedIntegration?.slug === 'evolution-whatsapp'` monta o `EvolutionWhatsAppDialog`.

## Verificações

- Restrições ESLint existentes (`no-restricted-syntax` bloqueando `functions.invoke('evolution-whatsapp-send')` fora do dispatcher) permanecem válidas — a nova UI não invoca a função de envio.
- Dispatcher (`src/lib/dispatchWhatsAppSend.ts`) inalterado.
- Feature flag `evolution_api_enabled` continua sendo a fonte de verdade para roteamento de envio; a nova UI não altera comportamento outbound.
- Nenhuma mudança em Meta Cloud, Twilio, `evolution-webhook` ou `evolution-whatsapp-send`.

## Rollback

- UI: reverter os 3 arquivos alterados (`IntegrationsSettings.tsx`, `AdminEvolution.tsx`) e remover `EvolutionWhatsAppDialog.tsx`.
- Catálogo: `UPDATE admin_integrations SET status='coming_soon' WHERE slug='evolution-whatsapp'` (o card some do catálogo do tenant sem exigir deleção de dados).
- Nenhum efeito colateral em endpoints, envio, recebimento ou dados do piloto.

## Status

- `/admin/evolution` — Production Ready (superfície interna).
- Configurações → Integrações → Evolution WhatsApp — disponível para tenants; ativa hoje apenas para Viagi (piloto), pronta para expansão organização a organização conforme feature flag.
