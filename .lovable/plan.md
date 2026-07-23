# Auditoria — Replicar aba "Conversas" na tela de Oportunidade

## Estado atual (verificado)

**Contato (`/contacts/:id`)** — aba **Conversas** renderiza `src/components/contacts/ContactConversations.tsx`, que:
- Chama o hook `useContactConversationsByContext(contactId)` (`src/hooks/contacts/useContactConversationsByContext.ts`).
- Consulta `message_threads` do contato, filtra `channel = 'whatsapp'` e `business_context IN ('sales','customer_service')`.
- Enriquece com mensagens reais (dedup contra threads vazias), endpoint e responsável.
- Renderiza dois cards lado a lado: **Comercial** (`sales`) e **Atendimento** (`customer_service`), cada um com estado vazio + CTA de iniciar (`NewConversationDialog`) e ação "Abrir" que reabre thread `resolved/closed` antes de navegar para `/messages?thread=…` ou `/inbox?thread=…`.

**Oportunidade (`/opportunities/:id`)** — hoje, em `src/pages/opportunities/OpportunityDetail.tsx`:
- Tab id `messages`, label `t('contacts.messagesTab')` (linha 79).
- Renderizado 2x (mobile linha 415, desktop `<Tabs.Panel id="messages">` linha 745).
- Componente atual: `<ContactMessages opportunityId={opportunity.id} />` (recebe `opportunityId`, não `contactId`).
- A oportunidade tem `contact_id` disponível no objeto (já usado em várias outras tabs: `calls`, `documents`, etc.).

## O que precisa mudar

Escopo puramente de UI/apresentação — nenhuma alteração em banco, RLS, edge functions, hooks de dados ou regras de negócio.

1. **Renomear a aba**: `id: 'messages'` → `id: 'conversations'`, label → `t('contacts.conversationsTab')` (mesma chave já usada na tela de contato; se a chave não existir para a Oportunidade, usar a mesma do módulo Contatos ou string literal "Conversas"/"Conversations" — verificar em `src/locales/*/common.json` no momento da implementação).
2. **Trocar o componente** nas duas ocorrências (mobile linha 415 e desktop linha 745/746):
   - De: `<ContactMessages opportunityId={opportunity.id} />`
   - Para: `<ContactConversations contactId={opportunity.contact_id} />`, com guard para `opportunity.contact_id` (fallback: mensagem "Oportunidade sem contato vinculado", seguindo o padrão já usado nas tabs `calls`/`documents`).
3. **Import**: remover `ContactMessages`, adicionar `ContactConversations` de `@/components/contacts/ContactConversations`.

## Ponto importante para o produto decidir (não implementar sem confirmação)

O card `ContactConversations` é **por contato**, não por oportunidade. Ele sempre mostra a thread comercial "representativa" do contato inteiro (regra determinística em `pickRepresentative`: maior nº de mensagens reais → última mensagem real → thread mais antiga).

Consequência: se um contato tiver **mais de uma oportunidade**, todas verão a **mesma** thread comercial. Isto está alinhado com a arquitetura atual (Messages = domínio Comercial por contato, thread única viva), mas é diferente do comportamento atual do `ContactMessages` que recebe `opportunityId`. Se a intenção for manter a visão "conversas específicas desta oportunidade", precisamos discutir antes — hoje o modelo de dados não amarra `message_threads` a `opportunity_id`, então replicar 1:1 o card do contato é a leitura correta do pedido.

## Detalhes técnicos

- Arquivos tocados: **apenas** `src/pages/opportunities/OpportunityDetail.tsx` (2 pontos de render + 1 definição de tab + imports).
- Sem migrations, sem edge functions, sem alterações de hook.
- i18n: reaproveitar chave `contacts.conversationsTab` (a mesma usada no ContactDetail). Confirmar existência ao implementar; caso ausente, adicionar em `pt-BR` e `en-US`.
- Navegação: mantida a mesma do card do contato — cliques levam a `/messages?thread=…` (comercial) e `/inbox?thread=…` (atendimento).

## Fora de escopo

- Não remover/alterar `ContactMessages` (ainda usado em `ContactDetail` de acordo com o hint, e não faz parte do pedido).
- Não mudar comportamento do card por oportunidade.
- Não mexer em roteamento por linha ativa, endpoints, capabilities.
