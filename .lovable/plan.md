
## Contexto

Duas coisas na mesma resposta:

1. **Resposta técnica à sua pergunta** ("100% de certeza que tudo em /inbox passa pelo 7027?").
2. **Feature de UI**: badge amarelo `Novo · NNNN` na lista do Atendimento, análogo ao azul de /messages.

---

## Parte 1 — Certeza sobre o 7027 (resposta objetiva)

**Não. Hoje eu não posso te garantir 100%.** A regra atual do Atendimento (ver `src/hooks/inbox/inboxScope.ts`) inclui uma thread quando:

- `contact.lifecycle_stage = 'customer'` **E** `endpoint.purpose NOT IN ('commercial','vendor_personal')` (endpoint NULL, `other` e `customer_service` passam), **OU**
- (flag `cs_inbox_includes_service_endpoints` ligada) `endpoint.purpose = 'customer_service'`.

Ou seja, uma thread pode entrar no Atendimento por dois caminhos:

- Endpoint 7027 (purpose `customer_service`) — captura tudo do 7027, cliente ou lead.
- Contato marcado como `customer` cujo `primary_endpoint` seja qualquer outro que não seja `commercial`/`vendor_personal` (7020, endpoint NULL, endpoint `other`, etc.).

Para transformar isso em certeza, o plano abaixo inclui uma **auditoria pontual** que roda no banco e classifica cada thread visível hoje por endpoint real. Sem alterar dado, só leitura.

## Parte 2 — Badge amarelo na lista do Atendimento

Espelho visual do que já existe em `/messages` (`EndpointBadge`, azul, `Novo · <últimos 4 dígitos>`), mas amarelo, em `InboxThreadList`. Fica ao lado do nome do contato, mesmo tamanho `sm`, e obedece a mesma regra de esconder quando o endpoint bate com um dos "números oficiais" da org (para não poluir).

### Passos

1. **Auditoria (read-only, sem migration)**
   - Rodar via `supabase--read_query` uma consulta que, para o `organization_id` atual, agrupa threads visíveis em cada aba do Atendimento (`active`, `waiting`, `resolved_today`) por:
     - `primary_endpoint.external_address`
     - `primary_endpoint.purpose`
     - `contact.lifecycle_stage`
   - Entrego a tabela com contagem por bucket. Aí você vê preto no branco quantas conversas do Atendimento hoje não são 7027 e por qual regra entraram.

2. **`EndpointBadge` ganha variante `tone`** (`src/components/messages/EndpointBadge.tsx`)
   - Prop nova: `tone?: 'blue' | 'amber'` (default `blue`, preserva o comportamento atual em `/messages`).
   - `amber` usa `border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400`.
   - Nada muda no callsite atual de `MessagesList`.

3. **Renderizar o badge na lista do Atendimento** (`src/components/inbox/InboxThreadList.tsx`)
   - A RPC `rpc_list_inbox_threads` já devolve `primary_endpoint.external_address` (confirmado na migration `20260701031205_...sql`), então não precisa tocar backend.
   - Puxar `useOrgWhatsAppEndpoints(organization?.id)` no `InboxPage` (já usado em `/messages`) e passar `officialNumbers` para o `InboxThreadList`.
   - No item da lista: `<EndpointBadge tone="amber" size="sm" externalAddress={t.primary_endpoint?.external_address ?? null} officialNumbers={officialNumbers} />`, posicionado ao lado do nome (mesma linha do horário), igual à /messages.
   - Sem mudanças de roteamento, filtro ou fetch.

## Fora de escopo

- Não vou mudar a regra de escopo do Atendimento nesta etapa. Só depois da auditoria a gente decide se aperta a regra (ex.: só 7027, ou só `customer` + 7027).
- Sem alteração em RPC, RLS, hooks de fetch, tabela `communication_endpoints` ou header do chat (esse já mostra o endpoint desde a última mudança).

## Riscos

- Baixíssimos. Mudança de UI aditiva; o badge só aparece quando há `external_address` e o número não é "oficial" da org (mesma regra que já usamos em /messages, então não vai poluir a lista de conversas do 7027 quando ele for oficial).

## Detalhes técnicos

- `EndpointBadge` hoje é hard-coded em azul; troco a classe base por um `switch(tone)` mantendo a paleta atual como default.
- `InboxThreadList` hoje não recebe `officialNumbers`; adiciono a prop e faço `InboxPage` passar via `useOrgWhatsAppEndpoints`.
- A consulta de auditoria não altera dado; retorna algo como `endpoint_address | purpose | lifecycle | tab | count`.
