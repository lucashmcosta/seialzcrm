# Mobile — Atendimento (Inbox)

Complemento de [`MOBILE_MESSAGES.md`](./MOBILE_MESSAGES.md). Só cobre o que é
**específico do Atendimento** (CS) e não está no doc de Messages. Schema base
de `message_threads` / `messages`, envio WhatsApp via `dispatchWhatsAppSend`,
janela 24h e Realtime já estão documentados lá — **não repetimos**.

Fonte: `src/hooks/inbox/*`, `src/components/inbox/*`, `src/pages/inbox/InboxPage.tsx`,
`supabase/migrations/20260530010202_*.sql` (schema base do Inbox v2),
`20260530173348_*.sql` (histórico + take_over),
`20260703171538_*.sql` (RPCs atuais).

---

## 1. Escopo da Inbox (o que é uma "thread de Atendimento")

Uma thread só aparece na Inbox se atender o predicado (definido em SQL nas RPCs
`rpc_list_inbox_threads` / `rpc_inbox_queue_counts` — **única fonte da
verdade**, o front chama sempre via RPC):

```
t.organization_id = <org atual>
AND (
  t.business_context = 'customer_service'                          -- PR3, preferido
  OR (
    t.business_context IS NULL
    AND (
      ( c.lifecycle_stage = 'customer'
        AND (e.purpose IS NULL OR e.purpose NOT IN ('commercial','vendor_personal')) )
      OR ( <flag org.cs_inbox_includes_service_endpoints>
           AND e.purpose = 'customer_service' )
    )
  )
)
```

Onde `c = contacts`, `e = communication_endpoints` via `t.primary_endpoint_id`.
"Commercial / vendor_personal" ficam **sempre fora** da Inbox — vão pra Messages.

## 2. Abas "Ativos / Aguardando / Concluídos hoje"

Filtro exato por aba, aplicado **em cima do escopo acima**:

| Aba UI            | `p_tab`           | Condição em `message_threads`                                                |
| ----------------- | ----------------- | ---------------------------------------------------------------------------- |
| Ativos            | `active`          | `status IN ('open','in_progress')`                                           |
| Aguardando        | `waiting`         | `status = 'awaiting_client'`                                                 |
| Concluídos hoje   | `resolved_today`  | `status = 'resolved' AND resolved_at >= p_resolved_since` (00:00 no TZ da org) |

`p_resolved_since` é calculado no client em `inboxScope.startOfDayIso(orgTimezone)`
(meia-noite local convertida pra UTC).

Os **contadores da barra** (`InboxMetricsBar`) vêm de `rpc_inbox_queue_counts`
e são **contagens de `message_threads`** dentro do mesmo escopo — não de
mensagens, não de contatos. Assinatura:

```
rpc_inbox_queue_counts(
  p_organization_id, p_only_mine, p_assigned_user_id,
  p_resolved_since, p_include_service_endpoints
) -> (active bigint, waiting bigint, resolved_today bigint)
```

Ordenação da listagem: `ORDER BY last_message_at DESC NULLS LAST LIMIT 200`.

## 3. Toggle "Apenas minhas"

É **só** `assigned_user_id = <internal user_id>` aplicado dentro da mesma
RPC (`AND (NOT p_only_mine OR t.assigned_user_id = p_assigned_user_id)`).
Não há regra extra por role — admin com toggle ligado vê só as próprias, e
com toggle desligado vê todas do escopo. O `internal user_id` é `users.id`
(não `auth.uid()`), obtido do `useOrganization().userProfile.id`.

## 4. Botão "Resolver" / "Reabrir"

**Resolver** (`InboxThreadDetail.handleResolve`) faz apenas:

```
UPDATE message_threads
SET status = 'resolved', resolved_at = now()
WHERE id = :thread
```

Sem edge function, sem webhook customizado. Efeitos colaterais que rodam via
triggers do próprio banco (independentes do Inbox):

- `trg_log_thread_assignment_change` **não** dispara aqui (só reage a
  mudança de `assigned_user_id`).
- Composer bloqueia envio quando `status IN ('resolved','closed')` — regra
  client-side em `InboxComposer` + guard server-side em `twilio-whatsapp-send`.
- Realtime `UPDATE` em `message_threads` re-hidrata a lista → thread some da
  aba "Ativos" e aparece em "Concluídos hoje" (se `resolved_at >= startOfDay`).

**Reabrir** (`handleReopen`) exige tratamento da unique constraint
`message_threads_unique_open_per_contact_endpoint`: se já existe outra thread
`open` para o mesmo `(contact_id, primary_endpoint_id, business_context)`,
o código apaga a "thread fantasma" vazia (0 mensagens) ou aborta com toast.
Só então faz `UPDATE status='open', resolved_at=NULL`. **Replicar essa lógica
no mobile** — sem ela, o botão explode com 23505 em contas ativas.

## 5. "Reatribuir para mim" / OwnerSelector — histórico

O UPDATE em si é só:

```
UPDATE message_threads
SET assigned_user_id = :user,
    assigned_at = now(),                -- ou NULL se devolvendo à fila
    last_routing_decision = jsonb_build_object(
      'action',  'take_over' | 'manual_assignment',
      'by_user_id', :user,
      'reason',  'inbox_reassign_to_self' | 'inbox_manual_reassign' | 'inbox_unassign' | ...,
      'at',      now()
    )
WHERE id = :thread
```

O campo `last_routing_decision` **é o gatilho do histórico**. A trigger
`trg_log_thread_assignment_change` (definida em
`20260530173348_*.sql`, `fn_log_thread_assignment_change`) só grava linha em
`thread_assignment_history` quando (a) `assigned_user_id` mudou **e**
(b) `NEW.last_routing_decision IS NOT NULL`. UPDATEs "burros" sem decisão
explícita são ignorados — evita ruído de backfill.

### Tabela `thread_assignment_history` (append-only)

```
id                    uuid PK
organization_id       uuid FK organizations
thread_id             uuid FK message_threads ON DELETE CASCADE
action_type           text CHECK IN (
  'initial_assignment','manual_assignment','round_robin','rule_match',
  'take_over','escalation','reopen','auto_reassign'
)
from_user_id          uuid FK users
to_user_id            uuid FK users
performed_by_user_id  uuid FK users
reason                text                 -- humanizado no client
metadata              jsonb DEFAULT '{}'   -- eco do last_routing_decision
created_at            timestamptz DEFAULT now()
```

RLS: `SELECT` para membros da org (via `organization_id = ANY(current_user_org_ids())`).
Índice `(thread_id, created_at DESC)`.

**Nunca fazer INSERT direto** — sempre passar pelo UPDATE em `message_threads`
com `last_routing_decision` bem formado. Alternativa server-side: RPC
`take_over_thread(_thread_id, _reason)` que valida `can_takeover_thread` ou
`manage_assignments` e bloqueia thread `resolved/closed`.

A lista da tela (painel "Histórico de Atribuição") é `SELECT * FROM
thread_assignment_history WHERE thread_id = ? ORDER BY created_at DESC LIMIT 50`
(ver `useInboxThread.refresh`). Realtime: `INSERT` em
`thread_assignment_history` filtrado por `thread_id`.

## 6. Painel de SLA

Campos usados (todos em `message_threads`):

- `sla_first_response_target_at` — deadline da 1ª resposta.
- `sla_resolution_target_at`     — deadline de resolução.
- `first_response_at`            — quando a 1ª resposta outbound saiu.

O chip (`InboxSlaChip`) é puramente derivado:

- se `first_response_at IS NOT NULL` → mostra "SLA OK".
- senão calcula `diff = target - now`:
  - `diff < 0` → vermelho, `−Xm/h/d`
  - `diff < 30min` → amarelo
  - resto → verde
- não faz fetch — só usa os campos que já vêm em `rpc_list_inbox_threads`.

**Como esses campos são populados**: o Inbox v2 **declara as colunas** em
`20260530010202_*.sql` e cria índice parcial
`(sla_first_response_target_at) WHERE first_response_at IS NULL`, mas
**não há trigger neste repositório** que preencha `first_response_at` nem
que aplique os targets a partir de `support_sla_configs`. `[INCERTO]` se
existe função/cron rodando direto no banco em produção — o mobile deve
apenas **ler e exibir** esses campos, nunca calcular localmente. Se
`sla_*_target_at IS NULL`, esconder o chip (é o que o web faz).

Definição operacional (regra de produto, para fins de UI): "1ª resposta" =
primeira mensagem `direction='outbound'` depois da mensagem inbound que
abriu/reabriu a thread. É **essa** semântica que `first_response_at` guarda —
mas quem escreve o campo está fora do escopo deste doc.

## 7. Chip da janela WhatsApp na Inbox

`WhatsAppWindowChip` chama exatamente o mesmo `getServiceWindow` já portado
(via `useServiceWindow({ contactId, lastInboundAt })`). A diferença visual é
só apresentação — no Inbox mostra **contagem regressiva** (`Sessão 24h · 23h 59m`)
em vez do binário aberto/fechado. O badge `CTWA 72h encerrada` vem de
`serviceWindow.billing.isCtwaContact && !billing.isOpen`. Nenhuma lógica
nova: só formatar `serviceWindow.conversation.remainingMs` e
`serviceWindow.billing.remainingMs` como `Xh Ym`.

Ele só renderiza quando `channel = 'whatsapp'`.

## 8. Botão "Nova conversa"

Reusa o `NewConversationDialog` do módulo Messages, com `intent="customer_service"`
e `routingDecision = { action: 'inbox_manual_start', by_user_id, at }`.
Fluxo real:

1. **Exige contato já cadastrado** — o dialog só oferece busca em `contacts`
   da org; não aceita número avulso. (Se precisar de outbound para número
   novo no mobile, o fluxo é criar o contato antes.)
2. Escolha do endpoint de envio: o dialog resolve automaticamente via
   `resolveComposerProvider` / `useOrgWhatsAppEndpoints` — prefere o endpoint
   `customer_service` da org; se não houver, cai para `other`. Nunca usa
   `commercial` / `vendor_personal` no fluxo de Inbox (guard duplicado no
   composer). O usuário não precisa escolher número, mas se houver mais de um
   `customer_service` o dialog exibe seletor.
3. Cria a thread com `business_context = 'customer_service'` e grava
   `last_routing_decision.action = 'inbox_manual_start'` — esse marker é o que
   libera o composer mesmo se `contact.lifecycle_stage != 'customer'`
   (regra `isManualInboxStart` em `InboxComposer`).
4. Retorna `threadId` — o front seleciona a thread recém-criada.

Nada dispara envio automaticamente; só cria a thread. A primeira mensagem
sai pelo composer normal (respeita janela 24h → template obrigatório fora).

## 9. Composer: "Responder" vs "Nota interna"

Duas coisas totalmente diferentes:

- **Responder** (`mode='reply'`) → chama `dispatchWhatsAppSend(...)` com
  `senderContext: 'inbox'`. Passa por todos os guards (janela 24h, template
  rate-limit, `assertTemplateAllowedForEndpoint`, `logComplianceBlock`).
  Vai efetivamente pro Twilio/Meta.

- **Nota interna** (`mode='note'`) → **INSERT direto em `messages`**,
  sem edge function, sem provider:
  ```
  INSERT INTO messages (
    thread_id, organization_id, contact_id,
    direction, content, is_internal_note,
    sender_user_id, created_at
  ) VALUES (..., 'internal', ..., true, current_user_id(), now())
  ```
  (campos exatos: ver `InboxComposer` — `is_internal_note = true`,
  `direction = 'internal'`). Nunca sai pra WhatsApp, nunca conta pra janela
  24h, mas **atualiza `last_message_*`** via trigger `fn_update_thread_last_message`
  igual mensagem normal. Renderizar visualmente distinto (fundo amarelo, ícone
  cadeado) e filtrar do "última mensagem" na lista se quiser.

Mobile: replicar o toggle. Nota interna não precisa checar janela nem
provider — só valida que o usuário tem acesso à org.

## 10. Permissões relevantes

Todas em `permission_profiles.permissions` (jsonb), consultadas via
`user_has_cs_permission(org_id, key)` (SECURITY DEFINER). Defaults só são
`true` para o profile `Admin` (ver `20260530010202_*.sql`, seção 8):

| Key                            | Onde é usada                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `can_manage_cs_queue`          | Reatribuir/atribuir threads de outros (RLS + `take_over_thread`)             |
| `can_takeover_thread`          | RPC `take_over_thread` (alternativa a `manage_assignments`)                  |
| `manage_assignments`           | Mesmo poder de reatribuir; permission "legada" do CRM inteiro                |
| `can_escalate_thread`          | Escalation (não usado na tela atual, mas existe no schema)                   |
| `can_close_threads`            | Fechar/resolver (`[INCERTO]` se hoje é enforced — botão Resolver hoje só faz UPDATE, RLS de UPDATE em `message_threads` não checa essa key) |
| `can_manage_support_settings`  | Editar `thread_routing_rules`, `escalation_targets`, `support_categories`    |
| `can_send_templates`           | Envio de template WhatsApp (checado em `twilio-whatsapp-send`)               |

Além dessas, permissões gerais que afetam a Inbox:
- `user_can_view_all(org, 'threads')` — vê threads não-atribuídas a ele
  (equivalente a "não é obrigado a filtrar por assigned_user_id").
- `hasVoiceIntegration` / `hasWhatsAppProvider` — presença de integração,
  não é permission por usuário.

**Não existe** `can_resolve_thread` nem `can_reassign_own` — não inventar.

## 11. Notificação de mensagem nova

Não há infraestrutura de push nativo neste projeto (nem tabela
`device_tokens`, nem `push_subscriptions`, nem Service Worker de push
configurado — só o SW de PWA / update). O web hoje reage a mensagem nova
via **Supabase Realtime** (`INSERT` em `messages` + `UPDATE` em
`message_threads`) e badge in-app da tabela `notifications`.

Para o mobile:

- Fase 1: mesma estratégia — Realtime enquanto o app está aberto, badge in-app.
- Fase 2 (push real): novo módulo — precisa criar tabela nova
  (`device_tokens (user_id, organization_id, platform, token, ...)`),
  edge function que faça fan-out por thread e providers (FCM/APNs).
  **Fora do escopo deste doc.** Não existe nada reaproveitável hoje.

---

## Resumo do que muda vs. Messages

| Item                    | Messages                              | Inbox                                                     |
| ----------------------- | ------------------------------------- | --------------------------------------------------------- |
| Fonte da listagem       | `rpc_list_message_threads`            | `rpc_list_inbox_threads` (escopo CS + tabs)               |
| Contadores              | contagem por status genérica          | `rpc_inbox_queue_counts` (active/waiting/resolved_today)  |
| business_context alvo   | qualquer / `commercial`               | `customer_service`                                        |
| Endpoint permitido      | qualquer                              | ≠ `commercial`, ≠ `vendor_personal`                       |
| lifecycle exigido       | —                                     | `customer` (ou override via endpoint CS / `inbox_manual_start`) |
| Composer bloqueia se…   | janela 24h fora → template            | + status resolved/closed + regras de endpoint             |
| Atribuição              | livre                                 | Histórico auditado (`thread_assignment_history` via trigger) |
| Nota interna            | não é fluxo padrão                    | 1º cidadão (toggle "Nota interna" no composer)            |
| SLA                     | não exibe                             | Chip com contagem regressiva / SLA OK                     |
| Nova conversa           | genérica                              | Sempre `business_context=customer_service` + `inbox_manual_start` |
