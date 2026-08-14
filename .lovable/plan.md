# Padronizar a lista de números do WhatsApp Comercial

Objetivo: uma lista única e visualmente uniforme de números, onde a única diferença entre linhas é a badge do provider e a badge de estado operacional. Nenhum nome interno, nome de instância ou dado técnico do provedor na tela.

## O que muda na tela

1. **Lista única de números**
   - Some a divisão por Route e o título interno (ex.: "Evolution (piloto Viagi)").
   - Todos os números vinculados às Routes Comerciais aparecem numa só lista, ordenados: ativo primeiro, depois por número.
   - Cabeçalho da seção: "Números do WhatsApp Comercial" + botão "Vincular número" (só para admin de integrações).

2. **Seção "Integração" removida**
   - Sai a lista de instâncias técnicas (ex.: "dev-int") e as ações "Verificar" / "Reiniciar".
   - Conectar por QR continua existindo, mas como ação da própria linha do número ("Conectar WhatsApp").

3. **Layout idêntico por linha**, na mesma ordem para qualquer provider:
   - Número (formato E.164 mascarado, fonte de dados).
   - Badge 1: provider — "Meta", "Evolution" ou "Twilio".
   - Badge 2: estado operacional, sempre na mesma posição e estilo:
     - Meta/Twilio: "Gerenciado pelo provedor".
     - Evolution: "Conectado", "Conectando…", "QR necessário", "Necessita conexão", "Identidade não confirmada", "Número divergente".
   - Badge "Ativo" quando é o número ativo de envio da Route.
   - Ações à direita, sempre no mesmo lugar, exibidas apenas quando fazem sentido:
     - "Conectar WhatsApp" (só Evolution, quando o estado exige conexão/QR).
     - "Tornar ativo" (quando o número não é o ativo e está elegível).
   - Motivos de bloqueio deixam de ser texto solto: passam a ser a própria badge de estado ou tooltip da ação desabilitada.

4. **Formulário "Vincular número"**
   - Mantido como está funcionalmente. O campo de instância da Evolution continua necessário para o vínculo, porém rotulado como "Sessão do WhatsApp" e exibido apenas quando o provider Evolution é escolhido.

## Fora de escopo

- Nenhuma mudança em Route/`active_endpoint_id`, feature flags, permissões, RPCs ou edge functions.
- Nenhum campo novo (WABA, Phone Number ID, App ID, Instance Name) é exibido.
- Nada muda para os números da Central; a alteração é apenas de apresentação.

## Detalhes técnicos

- Arquivo único alterado: `src/components/settings/SalesWhatsAppSettingsSection.tsx`.
- Achatar `status.routes[].endpoints` em uma lista com `lineId` carregado em cada item, para que "Tornar ativo" continue chamando `setActiveEndpoint({ lineId, endpointId })` da Route correta.
- Novo componente local `NumberRow` com grid fixo (número | badges | ações) para garantir alinhamento igual entre providers.
- Mapa de estado operacional derivado de `ManagerEndpoint.technicalStatus` (fonte já existente); `PROVIDER_MANAGED` → "Gerenciado pelo provedor". `BLOCKED_LABEL` reaproveitado apenas como tooltip.
- Remover uso de `status.evolutionInstances`, `humanState`, `refreshEvolutionIdentity` e `restartInstance` neste componente (hook permanece intacto).
- `SalesWhatsAppConnectDialog` continua sendo aberto a partir da linha do número, com `instanceName` do próprio endpoint.
