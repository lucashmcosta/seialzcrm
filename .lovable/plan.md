# Ponto canônico da atribuição — número pessoal (`vendor_personal`)

Auditoria read-only concluída. Nada implementado.

## Comparação das opções

- **A) função SQL central `(_organization_id, _endpoint_id) → suggested_user_id`** — viável e mínima. Ela é a única dona da regra "dono do endpoint pessoal, se válido"; validação de atividade/org fica em SQL, junto do round-robin.
- **B) adaptar `get_default_queue_for_thread` para ser consumido na criação** — não serve como ponto único: assinatura é `(_thread_id)`, e a thread só existe **depois** do contato (que é onde `contacts_round_robin` já grava `owner_user_id`). Usá-la na criação exigiria inverter a ordem contato→thread nos três webhooks. Mantida como **read model** e realinhada para chamar a função de A (uma lógica, dois consumidores).
- **C) camada TS compartilhada** — existe de fato: `_shared/sales-thread.ts` (`resolveSalesWhatsappThread`) é importada pelos três webhooks (Meta `index.ts:18`, Twilio, Evolution). Porém ela roda **após** a criação do contato, então sozinha não cobre o caso 3. Serve como ponto de fiação (wiring) da sugestão, não como dona da regra.

**Escolha: A como fonte de verdade + um único helper TS compartilhado (`_shared/inbound-assignee.ts`) que a consome**, chamado pelos três webhooks apenas no payload de criação do contato (uma linha por webhook, zero lógica duplicada). Observação técnica: não é possível resolver 100% dentro do banco sem tocar nos webhooks, porque `contacts` não conhece o endpoint de entrada e o cliente Supabase (PostgREST) não permite GUC transacional para passá-lo às triggers.

## Entrega

```text
CANONICAL_ASSIGNMENT_POINT= nova função SQL public.fn_resolve_inbound_suggested_assignee(_organization_id uuid, _endpoint_id uuid) returns uuid — única dona da regra; consumida por um helper TS compartilhado (_shared/inbound-assignee.ts) e por get_default_queue_for_thread
FILES/FUNCTIONS_TO_CHANGE=
  (SQL) nova fn_resolve_inbound_suggested_assignee
  (SQL) get_default_queue_for_thread → passa a delegar a essa função (mesma saída de hoje para vendor_personal)
  (SQL) trg_contacts_round_robin → inalterada na lógica; ganha marcação da própria decisão via set_config transacional ('app.rr_source') para a auditoria distinguir a origem
  (SQL) trg_contacts_round_robin_audit → texto do evento conforme a origem marcada
  (TS) novo _shared/inbound-assignee.ts (resolve a sugestão + registra a atividade quando a origem é o número pessoal)
  (TS) meta-whatsapp-webhook, twilio-whatsapp-webhook, evolution-webhook → apenas fiação: passam endpointId ao helper e incluem owner_user_id no INSERT do contato quando houver sugestão
  (SEM MUDANÇA) assign_round_robin, trg_threads_round_robin, trg_opportunities_round_robin, reassign_thread, sales-thread.ts, permissões de resposta
HOW_PERSONAL_OWNER_IS_VALIDATED= dentro da função SQL: endpoint pertence à org, is_active, purpose='vendor_personal', assigned_user_id NOT NULL e esse usuário com user_organizations.is_active=true na mesma org. Qualquer falha → retorna NULL (não é exigido round_robin_active, para não excluir dono legítimo que não participa do sorteio). Endpoint compartilhado (commercial/sales) → NULL sempre
HOW_ROUND_ROBIN_FALLBACK_WORKS= sugestão NULL ⇒ o INSERT do contato vai sem owner_user_id e o caminho atual roda idêntico: contacts_round_robin → assign_round_robin(org) → thread herda o owner via threads_round_robin. Nenhuma alteração em assign_round_robin nem em user_organizations.last_assigned_at
HOW_EXISTING_ASSIGNEE_IS_PRESERVED= a sugestão só entra no payload de INSERT de contato novo. Contato existente nunca sofre UPDATE de owner_user_id. Thread existente é reutilizada por resolveSalesWhatsappThread, que não escreve assigned_user_id; e trg_threads_round_robin dá RETURN NEW quando assigned_user_id já existe. Oportunidade continua herdando owner do contato
HOW_TIMELINE_AUDIT_IS_RECORDED= duas origens distintas: (1) round-robin → activities "Atribuição automática / Contato auto-atribuído via round-robin" (texto atual preservado, agora só quando a trigger realmente sorteou); (2) número pessoal → activities "Atribuição inicial / Contato atribuído ao dono do número pessoal <endpoint>", gravada pelo helper compartilhado. Na thread, quando aplicável, last_routing_decision = {action:'initial_assignment', reason:'personal_endpoint_owner'} → thread_assignment_history via fn_log_thread_assignment_change (action_type já existente na whitelist)
PROVIDER_DUPLICATION= NO — a regra vive em uma função SQL e em um helper TS; os webhooks só passam endpointId
COMPATIBILITY_RISK= BAIXO. Sem backfill, sem UPDATE em registros atuais, sem nova tabela/coluna. Todos os endpoints sales/commercial de produção têm assigned_user_id NULL, então a função retorna NULL e o comportamento atual permanece bit-a-bit. Único ponto de atenção: a marcação de origem para a auditoria altera dois triggers de contatos — validar em ensaio com ROLLBACK que o texto de round-robin continua idêntico quando a origem é o sorteio, e que o INSERT do inbound nunca falha por causa da auditoria
```

## Fluxo resultante (mesma cadeia, sem caminho paralelo)

```text
inbound (Meta | Twilio | Evolution)
  → resolve endpoint
  → _shared/inbound-assignee.ts → fn_resolve_inbound_suggested_assignee(org, endpoint)
       vendor_personal + dono válido → user_id
       qualquer outro caso        → NULL
  → contato: existente? mantém owner (nada a fazer)
             novo? INSERT com owner_user_id = sugestão (se houver)
                   sem sugestão → contacts_round_robin (comportamento atual)
  → thread canônica (sales-thread.ts): reutiliza ou cria; herda owner do contato; nunca reatribui
  → oportunidade: owner_user_id = owner do contato (inalterado)
  → timeline: nota de round-robin OU nota de dono do número pessoal
```

Fora de escopo: Route/fila/thread pessoal, mudança em permissão de resposta, qualquer reatribuição automática posterior, backfill.

Nada será implementado antes da sua aprovação.
