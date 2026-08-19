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

AUDITORIA DE ASSINATURA (executada, read-only)
CURRENT_PROVISION_LINE_ENDPOINT_SIGNATURE=
  public.provision_line_endpoint(p_organization_id uuid, p_line_id uuid, p_provider text,
  p_address text, p_purpose text, p_display_name text DEFAULT NULL, p_instance_name text
  DEFAULT NULL, p_assigned_user_id uuid DEFAULT NULL)  → oid 290675, SECURITY DEFINER,
  VOLATILE, EXECUTE para authenticated + service_role (anon herdado do padrão).
EXISTING_OVERLOADS=Nenhum. Existe exatamente 1 função com esse nome.
ADDING_TWO_DEFAULT_PARAMS_CREATES_NEW_OVERLOAD=YES
  (tipos/quantidade de argumentos fazem parte da identidade; CREATE OR REPLACE com 10
  params cria função NOVA e deixa a de 8 params viva)
OLD_CALLS_BECOME_AMBIGUOUS=YES
  (PostgREST chama por argumentos NOMEADOS; com os 8 nomes atuais as duas candidatas
  casam → "function is not unique" nos fluxos Meta/Evolution/tela Comercial)
DEPENDENCIES_ON_CURRENT_FUNCTION=
  Nenhuma dependência interna (nenhuma outra função/trigger/view referencia a função;
  pg_depend normal = 0). Chamadores: Edge `meta-whatsapp-connect`,
  Edge `sales-route-operations` (op provisionEndpoint) e, após esta fase, também
  op linkPendingInstance.

DECISÃO — caminho mais seguro (sem overload, sem duplicar regra)
  Padrão CORE + entradas finas:
  1) Criar `public.provision_line_endpoint_core(<8 params atuais>, p_sender_sid text,
     p_external_account_id text)` contendo o corpo ATUAL, transplantado sem alteração de
     regra, mais os 2 pontos aditivos da prova Twilio. Função interna: REVOKE de PUBLIC,
     EXECUTE apenas para service_role (não é chamável pelo cliente).
  2) `CREATE OR REPLACE public.provision_line_endpoint(<MESMOS 8 params, mesma ordem,
     mesmos defaults>)` → passa a ser um wrapper de 1 linha:
     `RETURN public.provision_line_endpoint_core(..., NULL, NULL);`
     Mesma identidade (mesmo oid), mesma assinatura, mesmos GRANTs, zero overload,
     zero ambiguidade. Meta, Evolution e a tela Comercial continuam chamando exatamente
     como hoje, sem alteração de código.
  3) `public.provision_line_endpoint_twilio_verified(<8 params atuais>, p_sender_sid text,
     p_external_account_id text)` → wrapper que exige p_sender_sid NOT NULL e delega ao
     core. EXECUTE apenas para service_role: somente a Edge (que verificou o sender na
     API Twilio com as credenciais da org) consegue chamá-la.
  PROVISIONING_RULES_DUPLICATED=NO — a regra existe uma única vez, no core.
  Alternativa considerada e descartada: nova função com corpo próprio para Twilio
  (duplicaria as guardas) e adicionar params à RPC atual (cria overload ambíguo).

TWILIO_CHANGES= (opção (a) aprovada — verificação server-side, sem registro intermediário)
  1) UI (src/components/settings/AddWhatsAppEndpointDialog.tsx): adicionar
     EndpointDestinationStep (destino + responsável obrigatório se Pessoal) e remover o
     INSERT direto em communication_endpoints. Submit chama
     useSalesRouteManager.provisionEndpoint com
     { provider:'twilio', address, destination, assignedUserId, displayName, senderSid }.
  2) Edge (op provisionEndpoint, provider='twilio'): antes de qualquer escrita,
     - carrega a integração twilio-whatsapp ATIVA da org (account_sid + auth_token);
     - GET https://messaging.twilio.com/v2/Channels/Senders/{senderSid} com as credenciais
       DA PRÓPRIA ORG; exige que o sender exista, esteja em estado utilizável (ONLINE) e
       que `sender_id` (whatsapp:+E164) case com o número informado. Falha → erro
       TWILIO_SENDER_NOT_VERIFIED / TWILIO_SENDER_ADDRESS_MISMATCH e NADA é escrito.
     - só depois chama `provision_line_endpoint_twilio_verified` com a prova verificada.
       Provider ≠ twilio continua chamando `provision_line_endpoint` (inalterado).
  3) Dentro do core, os 2 pontos aditivos:
     - gate de posse Twilio: aceita p_sender_sid como prova APENAS no ramo que hoje já
       levantaria PROVISION_ADDRESS_NOT_OWNED (nenhum IF existente é editado);
     - INSERT/UPDATE do endpoint grava sender_sid / external_account_id /
       organization_integration_id via COALESCE — no-op quando os params são NULL.
     purpose e assigned_user_id continuam gravados exclusivamente pelo core.
  4) Por que este é o caminho mais seguro/idempotente:
     - ZERO registro intermediário: nada é gravado em organization_phone_numbers (tabela de
       telefonia/voz — gravar ali criaria um número fantasma na tela de Voz) nem em
       qualquer tabela ponte. Se o provisionamento falhar, a transação inteira faz rollback
       e não sobra endpoint, vínculo, posse ou classificação parcial.
     - Retry do mesmo fluxo é idempotente: advisory lock por (org, whatsapp, dígitos) +
       caminho `reused` do core; repetir com o mesmo destino é no-op, repetir com destino
       diferente falha em PROVISION_ENDPOINT_PURPOSE_CONFLICT.
     - Nunca gera número utilizável mal classificado: só existe endpoint se ele nasceu com
       purpose correto e vínculo de Route na mesma transação; nunca toca
       messaging_lines.active_endpoint_id.
     - Os 13 endpoints Twilio legados com purpose='other' NÃO são alcançados: nenhum
       backfill, nenhum UPDATE em massa, e a guarda de purpose impede reclassificação
       silenciosa (tentar provisionar um deles falha com erro explícito).



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

GATES FINAIS (a comprovar na entrega)
META_USES_PROVISION_LINE_ENDPOINT=YES
EVOLUTION_USES_PROVISION_LINE_ENDPOINT=YES
TWILIO_USES_PROVISION_LINE_ENDPOINT=YES
EVOLUTION_LEGACY_PROVISION_SALES_USED=NO
DESTINATION_SELECTED_INSIDE_META_FLOW=YES
DESTINATION_SELECTED_INSIDE_EVOLUTION_FLOW=YES
DESTINATION_SELECTED_INSIDE_TWILIO_FLOW=YES
PERSONAL_REQUIRES_USER=YES
CUSTOMER_SERVICE_ROUTES_TO_CUSTOMER_SERVICE=YES
COMMERCIAL_ROUTES_TO_SALES=YES
PERSONAL_ROUTES_TO_SALES=YES
PROVISION_CHANGES_ACTIVE_ENDPOINT=NO
EXISTING_ENDPOINTS_CHANGED=0
TWILIO_LEGACY_OTHER_ENDPOINTS_CHANGED=0
BACKFILL_EXECUTED=NO
TWILIO_SENDER_VERIFIED_SERVER_SIDE=YES
TWILIO_OWNERSHIP_RETRY_IDEMPOTENT=YES
TWILIO_PARTIAL_FAILURE_LEAVES_INVALID_ACTIVE_ENDPOINT=NO
ROUND_ROBIN_CHANGED=NO
THREAD_MODEL_CHANGED=NO
ASSIGNMENT_RULES_CHANGED=NO

COMPATIBILITY_RISK=BAIXO
  - Nenhuma migração de dados; nenhuma alteração em round-robin, atribuição, threads,
    oportunidades, inbound, permissões ou active_endpoint_id.
  - Ponto de atenção 1: a RPC proíbe reclassificar purpose de endpoint existente
    (PROVISION_ENDPOINT_PURPOSE_CONFLICT). Vincular instância Evolution a um número que
    já exista com outro purpose falhará com mensagem clara — a UI traduz o erro
    (mapa LINK_ERROR já existe no painel).
  - Ponto de atenção 2: Evolution com destino "Atendimento" exige Route
    (messaging_lines) com inbox_key='customer_service' ativa na org; sem ela o erro é
    PROVISION_LINE_NOT_FOUND (nada é criado automaticamente).
  - Ponto de atenção 3: a única migração do escopo adiciona 2 parâmetros OPCIONAIS à
    RPC (sender_sid / external_account_id); nenhuma assinatura de chamada existente muda.

REGRESSION_REQUIREMENT (bloqueante)
  - A alteração em provision_line_endpoint é ESTRITAMENTE ADITIVA. Com
    p_sender_sid IS NULL e p_external_account_id IS NULL, a execução segue o mesmo
    caminho de hoje, instrução por instrução.
  - Nenhum IF existente de Meta ou Evolution é editado. Os dois params novos só
    aparecem em (i) uma cláusula adicional no gate de posse Twilio, alcançada apenas
    quando o caminho atual já iria levantar PROVISION_ADDRESS_NOT_OWNED, e (ii) duas
    atribuições no INSERT/UPDATE do endpoint que são no-op quando os params são NULL
    (COALESCE preservando o valor atual).
  - Compatibilidade binária: os params entram no FIM da assinatura com DEFAULT NULL,
    a função é recriada com CREATE OR REPLACE (mesmo nome/ordem dos params atuais),
    e os GRANTs são reaplicados. Chamadores atuais (Meta, Evolution, tela Comercial)
    continuam válidos sem alteração de código.
  - Antes do merge: reexecutar os cenários de Meta e Evolution (ensaio em transação
    com ROLLBACK, mesmos casos usados na Fase 3) e comparar saída da RPC campo a
    campo. Qualquer divergência de comportamento em Meta ou Evolution interrompe a
    implementação para revisão — não há merge parcial.
```


## Entrega

Ao final: diff por provider (Meta / Evolution / Twilio), resultado de `tsgo` (typecheck),
build e `deno check` das functions alteradas, mais o quadro de gates preenchido.
Parada obrigatória para validação manual antes de publicar.

