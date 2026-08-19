# Consolidação: destino do número escolhido dentro do fluxo de integração (Meta / Twilio / Evolution)

Princípio adotado: o usuário sai do modal da integração com o número conectado **e** classificado (Comercial / Atendimento / Pessoal + responsável). A tela "WhatsApp Comercial" permanece como gestão central, nunca como etapa obrigatória. Uma única regra de backend: `public.provision_line_endpoint`.

## Diff mínimo por provider

```text
META_CHANGES=
  Nenhuma mudança funcional. O fluxo já é o desejado:
  AddMetaWhatsAppNumberDialog (EndpointDestinationStep) → metaWhatsAppService.connect →
  meta-whatsapp-connect (valida Graph, grava credenciais/endpoint) → provision_line_endpoint
  (purpose, assigned_user_id, vínculo de Route). Único ajuste opcional (cosmético):
  no modal, o rótulo/estado inicial de destino hoje começa em "customer_service";
  manter assim ou explicitar o destino como escolha obrigatória sem default.

EVOLUTION_CHANGES=
  1) UI (src/components/integrations/evolution-whatsapp/EvolutionProvisionPanel.tsx):
     Passo 1 = EndpointDestinationStep (destino + responsável quando Pessoal), antes de
     "Nova sessão". Guardar destino/responsável por instância criada (estado local,
     e enviado no clique de "Vincular"/finalizar). Passo 2 = QR (inalterado).
     Passo 3 = ao ficar `open` + identidade conhecida, finalizar com o destino escolhido.
  2) Hook (src/hooks/useEvolutionProvisioning.ts): `useLinkPendingInstance` passa a aceitar
     { instanceId, destination, assignedUserId }.
  3) Edge (supabase/functions/sales-route-operations/index.ts, op linkPendingInstance):
     - validar destino ∈ {commercial, customer_service, vendor_personal} e exigir
       assignedUserId quando vendor_personal (mesma mensagem de erro já usada em
       provisionEndpoint: PROVISION_ASSIGNED_USER_REQUIRED);
     - resolver a Route pelo inbox_key do destino (sales | customer_service) em vez do
       `inbox_key='sales'` fixo;
     - trocar `rpc("provision_sales_endpoint", …)` por `rpc("provision_line_endpoint", …)`
       com p_purpose e p_assigned_user_id. Nenhuma nova validação no Edge: ownership,
       identidade, purpose×route e conflito continuam na RPC.
  4) Nenhuma migração: `provision_line_endpoint` já atualiza
     evolution_instances.endpoint_id/provisioning_status='linked' e já exige
     last_known_state='open' + owner_number_digits == número.

TWILIO_CHANGES=
  1) UI (src/components/settings/AddWhatsAppEndpointDialog.tsx): adicionar
     EndpointDestinationStep (destino + responsável obrigatório se Pessoal) e remover o
     INSERT direto em communication_endpoints.
  2) O submit passa a chamar useSalesRouteManager.provisionEndpoint com
     { provider:'twilio', address, destination, assignedUserId, displayName, senderSid }.
  3) Edge (op provisionEndpoint): aceitar `senderSid` (+ external_account_id derivado da
     integração twilio-whatsapp da org) e, APÓS a RPC, gravar apenas
     sender_sid / external_account_id / organization_integration_id no endpoint retornado.
     purpose e assigned_user_id continuam gravados exclusivamente pela RPC.
  4) Ownership: hoje a RPC exige número já "owned" (organization_phone_numbers ou endpoint
     existente). Como o sender Twilio é cadastrado manualmente, a ausência de lastro
     resultaria em PROVISION_ADDRESS_NOT_OWNED. Opções, a decidir na implementação:
     (a) aceitar `senderSid` verificado na API Twilio como prova de posse dentro do
         mesmo op do Edge (o Edge grava o registro de posse antes de chamar a RPC), ou
     (b) manter o cadastro do número em organization_phone_numbers no próprio fluxo.
     Em qualquer caso, purpose/assigned_user_id seguem só pela RPC.

GENERIC_SCREEN_CHANGES=
  Nenhuma remoção. "WhatsApp Comercial" segue com: lista de números, provider, destino,
  responsável, rota, padrão e "tornar padrão". O botão "Adicionar número" permanece como
  atalho de vínculo/classificação de números já existentes (mesma RPC), sem se tornar
  etapa obrigatória.

LEGACY_PROVISION_SALES_ENDPOINT_STILL_USED_WHERE=
  Após a mudança: em nenhum caminho de produto. Hoje é usada apenas em
  sales-route-operations op=linkPendingInstance (linhas ~973). A função SQL permanece no
  banco (não será dropada nesta fase) e os comentários das linhas 14 e 933 serão atualizados.

NEW_ENDPOINTS_CAN_STILL_BE_CREATED_AS_PURPOSE_OTHER=NO
  (nenhum caminho de UI restante insere endpoint sem destino explícito; o default
  'other' da coluna deixa de ser alcançável pelos fluxos de criação)

ALL_PROVIDERS_USE_PROVISION_LINE_ENDPOINT=YES
DESTINATION_SELECTED_INSIDE_INTEGRATION_FLOW=YES
EXISTING_ENDPOINTS_CHANGED=0
BACKFILL_REQUIRED=NO

COMPATIBILITY_RISK=BAIXO
  - Nenhuma migração de dados; nenhuma alteração em round-robin, atribuição, threads,
    oportunidades, inbound, permissões ou active_endpoint_id.
  - Ponto de atenção 1: a RPC proíbe reclassificar purpose de endpoint existente
    (PROVISION_ENDPOINT_PURPOSE_CONFLICT). Vincular instância Evolution a um número que
    já exista com outro purpose falhará com mensagem clara — comportamento desejado,
    mas a UI precisa traduzir o erro (mapa LINK_ERROR já existe no painel).
  - Ponto de atenção 2: Evolution com destino "Atendimento" passa a exigir Route
    (messaging_lines) com inbox_key='customer_service' ativa na org; sem ela o erro é
    PROVISION_LINE_NOT_FOUND (nada é criado automaticamente).
  - Ponto de atenção 3: o passo Twilio depende da decisão de ownership (item 4 acima);
    é o único ponto que pode exigir uma chamada extra à API Twilio no Edge.
```

Nada implementado. Aprove (e diga a opção de ownership do Twilio, se tiver preferência) que eu executo exatamente este diff.
