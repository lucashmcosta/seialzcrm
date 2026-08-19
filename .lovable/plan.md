# Auditoria READ-ONLY — “WhatsApp Comercial” vs modais de integração (Meta/Twilio/Evolution)

Nada foi alterado. Tudo abaixo é provado por código/SQL lidos nesta auditoria.

## Entrega

```text
META_GENERIC_FLOW_WORKS=PARTIAL
  UI: SalesWhatsAppSettingsSection.submitProvision → hook useSalesRouteManager.provisionEndpoint
  → Edge sales-route-operations op=provisionEndpoint → RPC provision_line_endpoint.
  NÃO cria conexão/credencial Meta, NÃO valida na Graph API, NÃO grava phone_number_id/WABA.
  A RPC exige que o número já seja “owned”: linha em organization_phone_numbers (provider meta*)
  OU endpoint Meta já existente — senão PROVISION_ADDRESS_NOT_OWNED. Grava purpose e
  assigned_user_id e cria/reativa o vínculo em messaging_line_endpoints. Nunca altera active_endpoint_id.

TWILIO_GENERIC_FLOW_WORKS=PARTIAL
  Mesma cadeia (provider='twilio' → família ['twilio']). Backend completo para
  vincular/classificar, mas idêntica exigência de posse prévia (organization_phone_numbers
  ou endpoint twilio existente). Não cria sender/Messaging Service, não valida Sender SID.

EVOLUTION_GENERIC_FLOW_WORKS=PARTIAL
  O formulário NÃO cria instância e NÃO mostra QR: pede o nome da instância
  (campo instanceName, options vindas de status.evolutionInstances) e pressupõe instância
  já existente e conectada. A Edge chama syncEvolutionIdentity antes da RPC e falha com
  PROVISION_EVOLUTION_NOT_CONNECTED; a RPC exige last_known_state='open' +
  owner_number_digits igual ao número digitado. Ou seja: só vincula/classifica.

META_INTEGRATION_MODAL_WORKS=YES
  AddMetaWhatsAppNumberDialog (mode='additional') → metaWhatsAppService.connect →
  Edge meta-whatsapp-connect: valida na Graph API, reaproveita tokens cifrados,
  cria/atualiza communication_endpoints com purpose + assigned_user_id (guardas
  endpoint_purpose_conflict / assigned_user conflict) e, no final, chama
  provision_line_endpoint para criar o vínculo de Route. Já usa o MESMO
  EndpointDestinationStep (Comercial/Atendimento/Pessoal + Responsável).
  MetaAdditionalEndpointsSection permite EDITAR purpose (update direto) — único lugar com edição.

TWILIO_INTEGRATION_MODAL_WORKS=PARTIAL
  AddWhatsAppEndpointDialog: INSERT direto em communication_endpoints (address + Sender SID +
  display_name), sem purpose (fica default 'other'), sem assigned_user_id e SEM vínculo de Route.
  AdditionalEndpointsSection só edita display_name/is_active e inbound_settings.
  Explica os 13 endpoints twilio com purpose='other' hoje no banco.

EVOLUTION_INTEGRATION_MODAL_WORKS=PARTIAL
  EvolutionProvisionPanel (card Evolution WhatsApp) é a porta oficial: createInstance, QR,
  estado real, syncPendingInstanceIdentity, deleteInstance com trava. O botão “Vincular”
  chama op=linkPendingInstance → RPC LEGADA provision_sales_endpoint (sem parâmetro de
  purpose e sem assigned_user_id) e força inbox_key='sales'. Logo: cria e conecta o número,
  mas não permite escolher Atendimento nem Pessoal.

GENERIC_SCREEN_CREATES_PROVIDER_CONNECTION=NO
GENERIC_SCREEN_ONLY_PROVISIONS_ENDPOINT=YES
DUPLICATED_UX_META=YES (destino escolhível nos dois lugares; modal é superset)
DUPLICATED_UX_TWILIO=NO (modal cria endpoint “cru”; tela genérica classifica/vincula — complementares, mas o modal cria endpoint sem purpose)
DUPLICATED_UX_EVOLUTION=YES (dois caminhos de vínculo: linkPendingInstance com purpose fixo e provisionEndpoint com destino escolhível)

CURRENT_CANONICAL_FLOW_META=Modal de integração (meta-whatsapp-connect) — único que cria conexão, valida provider, grava purpose/assigned_user_id e cria o vínculo de Route.
CURRENT_CANONICAL_FLOW_TWILIO=Nenhum fluxo é completo: modal cria endpoint sem purpose/Route; tela genérica classifica e vincula só se o número já existir. Canônico de fato = modal + tela genérica em sequência.
CURRENT_CANONICAL_FLOW_EVOLUTION=Card Evolution WhatsApp para criar/conectar (QR) + tela WhatsApp Comercial para vincular com destino; o botão “Vincular” do card é um atalho legado que fixa Comercial.

RECOMMENDED_SINGLE_UX_MODEL=OPÇÃO 3
  Divisão já sustentada pelo código (e pelo comentário do próprio EvolutionProvisionPanel:
  “INTEGRAÇÃO ≠ CONFIGURAÇÃO ≠ REGRA”):
   - Modal de integração = conectar/criar o número no provedor (credencial, validação Graph,
     QR, Sender SID, exclusão de sessão).
   - Tela WhatsApp Comercial = fonte única de destino (purpose), responsável
     (assigned_user_id), vínculo de Route e número ativo — incluindo reclassificação.
  Ajustes que isso implicaria (não implementados agora):
   a) remover EndpointDestinationStep do modal Meta (ou mantê-lo como conveniência mas
      delegando a gravação de destino à mesma RPC);
   b) trocar linkPendingInstance (provision_sales_endpoint legada) por provision_line_endpoint
      com destino explícito, ou remover o botão “Vincular” do card Evolution;
   c) fazer AddWhatsAppEndpointDialog (Twilio) parar de inserir endpoint com purpose='other'
      e/ou expor a classificação depois na tela WhatsApp Comercial;
   d) mover a edição de purpose do MetaAdditionalEndpointsSection para a tela genérica
      (edição provider-agnostic, hoje inexistente lá).

FILES_INVOLVED=
  src/components/settings/SalesWhatsAppSettingsSection.tsx
  src/components/settings/EndpointDestinationStep.tsx
  src/hooks/settings/useSalesRouteManager.ts
  supabase/functions/sales-route-operations/index.ts (ops provisionEndpoint, linkPendingInstance, setActiveEndpoint)
  RPCs: public.provision_line_endpoint (atual), public.provision_sales_endpoint (legada), public.rotate_messaging_line_endpoint
  src/components/integrations/meta-whatsapp-cloud/AddMetaWhatsAppNumberDialog.tsx
  src/components/integrations/meta-whatsapp-cloud/MetaAdditionalEndpointsSection.tsx
  src/services/metaWhatsAppService.ts + supabase/functions/meta-whatsapp-connect/index.ts
  src/components/settings/AddWhatsAppEndpointDialog.tsx (Twilio)
  src/components/settings/AdditionalEndpointsSection.tsx / EndpointInboundSettings.tsx
  src/components/integrations/evolution-whatsapp/EvolutionProvisionPanel.tsx + src/hooks/useEvolutionProvisioning.ts

COMPATIBILITY_RISK=BAIXO para consolidar (nenhum dado precisa migrar). Pontos de atenção:
  1) provision_line_endpoint tem GUARDA que proíbe reclassificar purpose existente
     (PROVISION_ENDPOINT_PURPOSE_CONFLICT) — qualquer UX de “reclassificar” precisa de
     caminho próprio, não da RPC de provisionamento.
  2) Estado atual do banco: 24 endpoints WhatsApp, 0 vendor_personal, 0 assigned_user_id,
     13 twilio com purpose='other' (herança do modal Twilio).
  3) Remover o botão “Vincular” do card Evolution sem substituto deixaria instâncias
     pendentes sem caminho até a tela genérica — trocar a RPC antes de remover.
```

Nenhuma implementação nesta etapa — diga qual opção adotar e eu preparo o diff mínimo.
