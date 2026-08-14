# Evolution WhatsApp como porta de entrada de provisionamento

## Auditoria read-only (feita agora)

**Card e dialog atuais**
- Card vem de `admin_integrations` slug `evolution-whatsapp` (categoria `whatsapp`, `config_schema = {}`), renderizado por `IntegrationsSettings.tsx`, que já roteia esse slug para o dialog dedicado `src/components/integrations/evolution-whatsapp/EvolutionWhatsAppDialog.tsx` (389 linhas). Hoje o dialog é **single-instance e read-mostly**: mostra estado/número, gera QR, atualiza webhook, health check e desconecta. Não tem "adicionar número" nem lista multi-número.

**Backend existente**
- `evolution-instance-manager`: ops `fetch, create, delete, connect, logout, connectionState, webhookFind, webhookSet`. Exige JWT + flag `evolution_api_enabled`. `create` já existe e fala com a Evolution, mas **por contrato nunca cria linhas locais** (`evolution_instances`, endpoints). `webhookSet` monta a URL com o secret no servidor (frontend nunca vê o secret).
- `sales-route-operations`: ops `status, connectInstance, restartInstance, instanceState, refreshEvolutionIdentity, provisionEndpoint, setActiveEndpoint`. `instanceState` já devolve `connected/identityKnown/identityMatchesEndpoint`. `provisionEndpoint` chama a RPC `public.provision_sales_endpoint`, que para Evolution já exige instância conectada (`last_known_state='open'`), `owner_number_digits` preenchido e igual ao endereço, e cria/localiza o `communication_endpoint` + vínculo com a Route — sem ativar.
- Secrets presentes: `EVOLUTION_BASE_URL`, `EVOLUTION_GLOBAL_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`. Flag `evolution_api_enabled`: ON só para Viagi, default global OFF.

**Lacuna real**
1. `public.evolution_instances.endpoint_id` é **NOT NULL** → hoje é impossível registrar uma instância antes de conhecer o número (o número só aparece depois do QR). Este é o único bloqueio estrutural.
2. Não existe operação que faça o encadeamento "gerar nome técnico → criar na Evolution → webhook → QR" persistindo a instância pendente na organização do usuário.

## O que será implementado

### 1. Migração mínima (única mudança de schema)
- `evolution_instances.endpoint_id` passa a aceitar `NULL` (instância pendente, ainda sem número conhecido).
- Coluna `provisioning_status text NOT NULL DEFAULT 'pending'` (`pending` | `linked`) para a UI distinguir instância em provisionamento de número já vinculado.
- Índice único parcial em `(organization_id, instance_name)` mantendo o comportamento atual de nome único.
- Nenhuma alteração em endpoints, `messaging_lines`, `messaging_line_rotations`, purposes, webhooks Meta, RLS de Atendimento ou na RPC `provision_sales_endpoint` (ela já tolera `endpoint_id NULL`).

### 2. Nova operação de backend `createInstance` (em `sales-route-operations`)
Fluxo atômico, tudo server-side, com JWT + `can_manage_integrations_in_org` + flag `evolution_api_enabled`:
1. gera `instanceName` técnico (`evo-<slug-org>-<random>`, validado pelo regex já existente);
2. insere `evolution_instances` pendente (`endpoint_id NULL`, `provisioning_status='pending'`) na org do chamador;
3. cria a instância na Evolution com a Global API Key;
4. configura webhook (URL montada no servidor com o secret);
5. pede QR e devolve `qrBase64` + `pairingCode` + `expiresAt`;
6. em qualquer falha upstream, remove a linha pendente (sem lixo).

Reuso sem mudança: `instanceState` para polling, `refreshEvolutionIdentity` para gravar `owner_jid`/`owner_number_digits`, `provisionEndpoint` para criar/localizar o endpoint quando `connected === true` e a identidade for conhecida — com `provisioning_status` virando `linked`.

### 2b. `deleteInstance` com guarda de uso (trava obrigatória)
- `provisioning_status='pending'` e `endpoint_id IS NULL`: remove a instância pendente e o recurso remoto na Evolution.
- `provisioning_status='linked'`: antes de qualquer remoção, verifica se o `endpoint_id`
  (a) é `active_endpoint_id` de alguma `messaging_lines`;
  (b) tem `messaging_line_endpoints` ativo;
  (c) está em uso em Route Comercial (`inbox_key='sales'`) ou Atendimento (`inbox_key='inbox'`).
  Em qualquer um dos casos: retorna `409 EVOLUTION_INSTANCE_IN_USE` e **não remove nada** (nem local, nem remoto).
- Nenhuma remoção rotaciona Route, troca `active_endpoint_id`, desativa endpoint Meta ou remove vínculo — desvincular exige ação explícita separada, fora deste fluxo.

### 3. UI: dialog "Evolution WhatsApp" passa a ser o gerenciador do provider
Reescrita do `EvolutionWhatsAppDialog` para lista multi-número:
- lista de instâncias Evolution da organização com número (mascarado), estado operacional e status de provisionamento;
- botão **Adicionar número** → abre etapa de QR embutida (reaproveita a lógica de polling estrito já validada no `SalesWhatsAppConnectDialog`);
- por item: Reconectar (QR), Atualizar estado, Atualizar webhook, Remover (com confirmação);
- ao concluir com sucesso, mostra "número disponível para vínculo em WhatsApp Comercial" e nada mais — sem tornar ativo.
- nenhuma exposição de URL/token/instance_id_remote.

### 4. WhatsApp Comercial
Nenhuma tela nova. `SalesWhatsAppSettingsSection` já lista endpoints com provider/estado e a ação "Tornar ativo" com elegibilidade — o número novo aparece lá automaticamente após o `provisionEndpoint`. Removeremos apenas o ponto de entrada de provisionamento/QR de lá, deixando-o exclusivo no card Evolution (o modal de conexão continua disponível para reconectar um número já vinculado).

## Garantias de segurança do fluxo
- `active_endpoint_id` só muda via `setActiveEndpoint` → `rotate_messaging_line_endpoint`, que **não** é chamado em nenhum passo deste fluxo.
- `provisionEndpoint` cria vínculo inativo; sucesso do QR não dispara ativação.
- Nada do fluxo lê ou escreve endpoints Meta/Twilio, webhooks Meta, purposes, Resolver V2 ou threads de Atendimento.
- Flag `evolution_api_enabled` continua bloqueadora: com OFF, todas as ops retornam 403.

## Validação da migração (trava obrigatória)
Snapshot antes e depois, na mesma sessão, com backfill seguro (`endpoint_id NOT NULL → provisioning_status='linked'`). Pós-condições que precisam sair PASS antes de seguir para o backend:

```text
EXISTING_EVOLUTION_ENDPOINT_IDS_PRESERVED=PASS
EXISTING_INSTANCES_LINKED=PASS
PENDING_EXISTING_INSTANCES=0
META_ENDPOINTS_CHANGED=0
ACTIVE_ENDPOINT_CHANGED=NO
MESSAGING_LINE_ROTATIONS_NEW=0
ATENDIMENTO_CHANGED=NO
```

Somente instâncias criadas pelo novo `createInstance` podem nascer com `endpoint_id IS NULL` + `provisioning_status='pending'`.

## Ordem de execução
1. migração mínima;
2. validação pós-migração (pós-condições acima);
3. backend `createInstance`;
4. backend `deleteInstance` com guarda de uso;
5. UI multi-instância no card Evolution;
6. testes com `evolution_api_enabled` OFF na Central;
7. só depois, e somente após todo o código deployado e pós-condições PASS, habilitar `evolution_api_enabled` para a Central e testar com celular real.

## Confirmações solicitadas
- META_EXISTING_ENDPOINTS_TOUCHED=NO
- ACTIVE_ENDPOINT_CHANGE=NO
- ROTATION_CHANGE=NO
- ATENDIMENTO_CHANGE=NO
- SCHEMA_CHANGE_REQUIRED=YES (apenas `evolution_instances`: `endpoint_id` nullable + `provisioning_status` + índice único)
- READY_FOR_SAFE_IMPLEMENTATION=YES

Nenhum write foi executado nesta auditoria.
