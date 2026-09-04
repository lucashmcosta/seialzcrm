# Mobile: migrar Mensagens (comercial) e Início para as RPCs existentes

Verificado no banco: **as duas RPCs já existem** e não é preciso criar função nem índice novo. O trabalho é trocar as consultas do app e documentar os contratos.

---

## Parte 1 — Lista de conversas de Mensagens (comercial)

**Nome exato:** `rpc_list_message_threads` (mesma que a tela web usa em `src/hooks/useMessageThreads.ts`).

Assinatura (usar sempre a versão com `p_search`):

```
rpc_list_message_threads(
  p_organization_id  uuid,
  p_status           text   default null,     -- null = tudo menos 'resolved'
  p_channels         text[] default null,     -- ['whatsapp']
  p_assigned_user_id uuid   default null,     -- equivalente a "só minhas"
  p_unassigned_only  boolean default false,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id        uuid   default null,
  p_limit            integer default 50,
  p_search           text   default null
)
```

Retorno (uma linha por conversa, campos já resolvidos): `id`, `contact_id`, `contact_name`, `contact_phone`, `channel`, `subject`, `status`, `last_message_id`, `last_message_content`, `last_message_direction`, `last_message_at`, `last_inbound_at`, `whatsapp_last_inbound_at`, `needs_human_attention`, `agent_typing`, `awaiting_button_response`, `assigned_user_id`, `assigned_user_name`, `updated_at`, `created_at`, `is_unread`.

- **Escopo comercial:** filtra `business_context = 'sales'` e, para threads antigas sem valor, aplica o fallback (contato não-cliente e endpoint que não seja de atendimento).
- **Não lida:** já vem em `is_unread`, com o join de `message_thread_reads` do usuário logado dentro da função — dispensa o round-trip extra.
- **Busca:** `p_search` roda no banco sobre o dataset completo (nome, telefone e telefone só-dígitos).
- **Ordenação:** `COALESCE(last_message_at, created_at) DESC NULLS LAST, id DESC`.
- **Paginação:** por cursor (`p_cursor_updated_at` + `p_cursor_id`), não offset.
- **Segurança:** exige vínculo ativo com a organização (`ACCESS_DENIED`) e respeita "ver tudo" × "ver só o meu".
- **Índices:** já existem `idx_threads_org_bizctx_lastmsg (organization_id, business_context, last_message_at DESC NULLS LAST)` e `idx_threads_org_channel_updated`. Nada a criar.

Diferenças em relação ao contrato que você imaginou: não há `p_only_mine` (use `p_assigned_user_id`), não há `p_offset` (cursor), e canal vai como array.

**Mudanças no app:** trocar o `from('message_threads').select(...)` pela RPC; busca com debounce ~300 ms indo ao banco em vez de filtrar as 100 linhas em memória; "carregar mais" enviando o cursor da última linha; usar `is_unread` e remover a leitura separada de `message_thread_reads` na listagem (o upsert ao abrir a conversa continua).

---

## Parte 2 — Início (dashboard)

**Nome exato:** `get_home_dashboard_stats` (wrapper público; a `_core` não é chamável pelo app).

```
get_home_dashboard_stats(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_from_day        date,
  p_to_day          date,
  p_owner_user_id   uuid default null,
  p_tz              text default 'America/Sao_Paulo',
  p_prev_from       timestamptz default null,
  p_prev_to         timestamptz default null,
  p_prev_from_day   date default null,
  p_prev_to_day     date default null
) returns json
```

Retorno exato:

```json
{
  "kpis":   { "created_count": 0, "created_count_prev": 0, "won_count": 0, "won_count_prev": 0 },
  "status": { "open": 0, "won": 0, "lost": 0 },
  "trend":  [ { "bucket_date": "2026-09-01", "created": 0, "won": 0 } ]
}
```

Respostas diretas:

- **Escopo de responsável:** não existe parâmetro `canViewAll`. A própria RPC lê a permissão `view_all_opportunities` do usuário: sem ela, força o escopo ao próprio usuário e **ignora** `p_owner_user_id`; com ela, aplica `p_owner_user_id` quando informado, ou "todos" quando nulo. O app não precisa (nem deve) decidir isso.
- **Período anterior:** calculado no banco. Os 4 parâmetros `p_prev_*` são opcionais e só devem ser enviados nos casos "esta semana" e "este mês", para alinhar o mesmo trecho da semana/mês anterior; nos demais presets deixe nulos e o fallback de mesma duração é aplicado.
- **Bucketização:** o `trend` vem **diário** e já preenchido com zeros para todos os dias do período (no fuso `p_tz`). A agregação **semanal continua no cliente** — é o mesmo desenho da web.
- **Listas de oportunidades (entradas/fechadas):** **não** vêm na RPC, de propósito — eram o que pesava no carregamento. Devem ser buscadas **sob demanda**, só quando o usuário abrir o detalhe, com `select` enxuto (`id`, `title`, `amount`, `status`, data, nome do contato), `ORDER BY` explícito e `limit`.
- **Conversão:** derivada no cliente (`won_count / created_count * 100`), como na web.

**Mudanças no app (`use-dashboard-stats.ts`):** remover os dois loops de `fetchAllPagedRows` sobre `opportunities` e as agregações em JS; passar a uma única chamada de RPC; manter só a agregação semanal e o cálculo de conversão; mover as duas listas para consulta sob demanda no detalhe.

---

## Documentação

Registrar os dois contratos em `docs/mobile/backend-reference.md`, citar a RPC de threads em `docs/modules/messages/data-model.md`, e abrir as duas tarefas no `roadmap.md`.

## Nota técnica

`rpc_list_message_threads` existe em duas assinaturas (8 e 9 parâmetros — a de 9 adiciona `p_search`), drift já conhecido. Chamadas com argumentos nomeados incluindo `p_search` resolvem para a versão certa; remover a assinatura antiga é uma migração à parte, fora deste trabalho.

Nada aqui altera banco, RLS, permissões ou a versão web.
