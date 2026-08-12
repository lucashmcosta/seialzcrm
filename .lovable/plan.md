# IMPACT ASSESSMENT — GMUD Conversas Multicanal

Documento de diagnóstico read-only. Nada foi implementado, nenhuma migration gerada, nenhum código alterado. Objetivo: confrontar a GMUD com o código real.

## 1. Veredito executivo

A GMUD é implementável, mas **não é uma mudança incremental**: ela colide com duas decisões estruturais hoje vigentes — (a) a identidade da thread inclui o endpoint (`primary_endpoint_id`), (b) existem duas superfícies de conversa independentes (Messages/comercial e Inbox/atendimento) com hooks, RPCs, composers e realtime próprios. Migrar para "uma conversa por contato + canal" exige tocar índices únicos, 4 webhooks, 2 dispatchers duplicados, 2 UIs + 2 UIs mobile e ~20 hooks.

## 2. Entidades e fontes de verdade (estado real)

| Conceito | Fonte de verdade hoje | Observação |
|---|---|---|
| Conversa | `message_threads` (19.190 linhas) | Identidade = `(organization_id, contact_id, channel, primary_endpoint_id)` |
| Mensagem | `messages` (12 triggers no hot path) | 4.764 mensagens sem `endpoint_id` |
| Número/canal | `communication_endpoints` (20) | `purpose`, `inbound_settings`, `requires_template_outside_window` |
| Linha de envio | `messaging_lines.active_endpoint_id` | Fonte de verdade do **envio**; thread guarda só o histórico |
| Fila de ingest | `integration_inbound_events` (110k) | Auditoria/idempotência, **não** é caminho de escrita |
| Sessão webchat | `webchat_sessions` / `webchat_session_messages` | Promovido ao domínio só via RPC `promote_session_to_contact` |

Índices únicos parciais existentes: `message_threads_unique_open_per_contact_endpoint` (com endpoint) e `..._legacy` (endpoint nulo). **Qualquer unificação por contato precisa substituir esses dois índices e conviver com 695 pares contato+canal que já têm múltiplas threads e 617 contatos com múltiplos endpoints ativos.**

## 3. Inbound — 4 implementações paralelas, zero núcleo compartilhado

Cada webhook resolve contato, endpoint e thread por conta própria:

- **Meta** (`meta-whatsapp-webhook`): endpoint por `sender_sid = phone_number_id`; gate BR inline próprio (grava `contact_ingress_failures`); sem migração de provider.
- **Twilio** (`twilio-whatsapp-webhook`): endpoint via RPC `resolve_communication_endpoint`; fallback para thread legada com `primary_endpoint_id IS NULL` e backfill; usa helper `resolveContactIngressIdentity`.
- **Evolution** (`evolution-webhook`): endpoint via `evolution_instances.endpoint_id` (estático, provisionado fora do fluxo); **único que migra thread de provider** (`THREAD_PROVIDER_MIGRATED`) reaproveitando a thread mais recente do contato.
- **Webchat** (`webchat-message`): não escreve em domínio; a criação de contato/oportunidade/thread/mensagem é toda dentro de uma RPC SECURITY DEFINER.

`integration-inbound-dispatcher` **não processa inbound** — é comparador shadow read-only do Twilio, escreve apenas em `integration_inbound_dry_run_log`.

Regra `auto_create_opportunity`: hierarquia idêntica replicada 3x em código (`endpoint.inbound_settings` → `organization_integrations.whatsapp_inbound_settings` → default `false`). **Webchat ignora a flag e sempre cria oportunidade.** Isso é uma divergência de negócio real, não de código.

## 4. Outbound — dois dispatchers já divergentes

`src/lib/dispatchWhatsAppSend.ts` (browser) e `supabase/functions/_shared/dispatch-whatsapp-send.ts` (edge) implementam a mesma cadeia: `endpointId` explícito → linha ativa por purpose (`messaging_lines`) → `thread.primary_endpoint_id` → último `messages.endpoint_id` → default Twilio, fail-closed em erro.

Riscos concretos já presentes:
- **Drift**: o cliente tem uma condição extra de re-route (`salesContextMismatch`) que o servidor não tem.
- **Hardcodes vivos**: re-route para o endpoint fixo `407ff93d-…` para uma org específica; `complianceGuards.ts` com endpoint 7020 e 2 template IDs cravados e janela de 7 dias vencida.
- **UI fora de sincronia**: `resolveComposerProvider` (que antecipa o re-route na UI) é usado em Messages e mobile, **mas não no InboxComposer** — o Inbox pode listar templates de um provider diferente daquele que o dispatcher usará.
- `migrateThreadAndSend.ts` não tem nenhum call site em `src/` — código morto ou preparado e não ligado.

## 5. Frontend — duplicação em 4 superfícies

`MessagesList.tsx` (2.829 linhas), `InboxPage.tsx` + `components/inbox/*`, `MobileMessagesList.tsx` (1.181), `MobileInbox.tsx` (617). Compartilham apenas primitivos (`components/whatsapp/*`). Não há componente de timeline comum.

Performance (bloqueante para uma timeline unificada, que será mais longa que as atuais):
- Timeline de `/messages`: query única sem range, sem paginação.
- Timeline do Inbox: `.limit(500)` fixo, sem "carregar mais" — mensagens antigas simplesmente não existem na UI.
- **Zero virtualização e zero `React.memo`** nas três timelines.
- Realtime de mensagens sem debounce, mutando array de estado com enrich assíncrono (condição de corrida em bursts). Só a lista de threads tem coalescing.

Unificar conversas por contato aumenta o tamanho médio da timeline (soma dos threads por endpoint) exatamente onde não há virtualização nem paginação. **Esse é o maior risco de regressão perceptível ao usuário.**

## 6. RPCs envolvidas

`rpc_list_message_threads` (2 overloads — drift conhecido), `rpc_get_message_threads_by_ids`, `rpc_list_inbox_threads`, `rpc_inbox_queue_counts`, `resolve_communication_endpoint`, `merge_message_threads` / `unmerge_message_thread`, `promote_session_to_contact`, `get_default_queue_for_thread`. Uma unificação por contato altera o contrato de retorno das quatro primeiras e torna `merge_message_threads` central em vez de excepcional.

## 7. Riscos ordenados

1. **Identidade da thread** — trocar os índices únicos com 695 conflitos preexistentes; sem estratégia de merge determinística há risco de perda de segmentação comercial/atendimento (que é decisão de negócio em ADR-0009).
2. **Hot path de `messages`** — 12 triggers; qualquer backfill/merge em massa precisa de lote pequeno e cron pausado (ADR-0007).
3. **Regressão de performance** na timeline unificada (sem virtualização/paginação).
4. **Divergência inbound** — 4 caminhos independentes; corrigir a regra em um não corrige nos outros.
5. **Hardcodes de compliance/re-route** — precisam sair antes, ou serão carregados para o modelo novo.
6. **Webchat fora da regra de `auto_create_opportunity`**.
7. **Drift cliente/servidor** nos dispatchers, que se agrava se o roteamento passar a ser por inbox/contato.

## 8. Pré-condições técnicas (não é plano de implementação, é lista de bloqueios)

- Decidir se Inbox e Messages continuam separados (ADR-0009) — a GMUD assume unificação e isso contradiz um ADR vigente; precisa de novo ADR antes de código.
- Resolver os 695 pares contato+canal com múltiplas threads e as 4.764 mensagens sem endpoint.
- Consolidar os dois dispatchers em um só antes de mudar a chave de roteamento.
- Extrair um núcleo de ingest compartilhado antes de mexer na identidade da thread.
- Introduzir paginação + virtualização na timeline antes de unificar históricos.

## 9. Lacunas do diagnóstico (não confirmadas nesta auditoria)

- Corpo de `inboxScope.ts` (se há paginação real na lista do Inbox).
- Enumeração completa de guards em `InboxComposer.tsx` e `evolution-whatsapp-send`.
- Provisionamento de `evolution_instances.endpoint_id` (garantia de sincronia com `communication_endpoints`).
- Se o dispatcher do servidor é acionado por algum caminho além de `scheduled-messages-cron`.
