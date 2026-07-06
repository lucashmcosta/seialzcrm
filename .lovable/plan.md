# Plano — `docs/MOBILE_CONTACTS.md`

Criar um único documento de referência, no mesmo formato de `docs/mobile/backend-reference.md` e `docs/mobile/dashboard-spec.md`, para o agente que vai implementar o módulo de Contatos no app mobile (React Native / Expo consumindo o mesmo Supabase).

Localização: `docs/mobile/contacts-spec.md` (para ficar alinhado ao padrão da pasta `docs/mobile/`; posso salvar como `docs/MOBILE_CONTACTS.md` na raiz de `docs/` se você preferir — me diga na aprovação).

## Fontes de verdade que vou consultar antes de escrever

- Banco (via `supabase--read_query`): `information_schema.columns` de `contacts`, `companies`, `communication_endpoints`, `tags`, `tag_assignments`, `custom_field_definitions`, `custom_field_values`, `organizations` (colunas `duplicate_check_mode`, `duplicate_enforce_block`, `view_all_contacts`).
- RLS/policies das mesmas tabelas + RPC `rpc_search_contacts` (assinatura e retorno reais).
- Código web (fonte da UX): `src/pages/contacts/ContactsList.tsx` (795 linhas), `ContactDetail.tsx` (908), `ContactForm.tsx` (588), `src/hooks/contacts/useContactConversationsByContext.ts`, `src/components/mobile/MobileContactsList.tsx`, `src/lib/phoneUtils.ts`.
- Docs existentes: `docs/modules/contacts/README.md`, `docs/modules/contacts/data-model.md`, `docs/modules/companies/data-model.md`, `docs/decisions/0001-multi-tenancy-organization-id.md`, ADRs sobre `view_all_*` e atribuição.

Se algo divergir entre código e docs, marco `[INCERTO]` conforme regra do projeto — não invento regra de negócio.

## Estrutura do documento

1. **Contexto e escopo mobile v1**
   - O que entra no v1 (lista, detalhe, criação, edição, busca, filtros) e o que fica fora (merge, custom fields avançados, import).

2. **Schema completo** — uma subseção por tabela, com tabela markdown `coluna | tipo | nullable | default | observação`:
   - `contacts` (61 colunas — identificação, contato, endereço, docs legais BR: CPF/RG/nascimento, lifecycle, atribuição `owner_user_id`, marketing attribution, timestamps, soft-delete).
   - `companies` (11 colunas + relação `contacts.company_id`).
   - `communication_endpoints` (22 colunas — canal, endereço, `purpose`, status, `is_primary`).
   - `tags` (6) + `tag_assignments` (6).
   - `custom_field_definitions` (12) + `custom_field_values` (8) — como o mobile deve ler/gravar.
   - Trecho relevante de `organizations`: `view_all_contacts`, `duplicate_check_mode`, `duplicate_enforce_block`, `default_owner_user_id`, round-robin flags.

3. **RLS e multi-tenancy**
   - Padrão `organization_id = ANY(current_user_org_ids())`, uso obrigatório de `users.id` (nunca `auth.uid()`) em `owner_user_id` etc.
   - Regras específicas por tabela (5 policies em `contacts`, 5 em `communication_endpoints` etc.).

4. **Tela de listagem**
   - Paginação: cursor vs offset — vou confirmar no código (`ContactsList.tsx` + `fetchAllPagedRows`) e documentar exatamente o que hoje é usado; recomendação mobile: infinite scroll por offset de 50, como `MobileContactsList` já faz.
   - Campos no card (nome, telefone primário via `communication_endpoints`, empresa, tags, dono, lifecycle badge).
   - Filtros disponíveis (lifecycle stage, dono, tags, empresa, data) e ordenação.
   - Busca: assinatura real de `rpc_search_contacts` (parâmetros e colunas retornadas). Fallback `ilike` quando aplicável.
   - Regra `viewAllContacts`: confirmar leitura no código; documentar “se `organizations.view_all_contacts = false`, aplicar `owner_user_id = <users.id do usuário logado>` no filtro cliente, mesmo padrão de Oportunidades”. Marcar `[INCERTO]` se o código não confirmar.

5. **Tela de detalhe**
   - Seções: identificação, endereço, docs legais, canais (`communication_endpoints`), tags, empresa, dono, campos personalizados, atividade.
   - Relacionamentos exibidos: oportunidades (`opportunities.contact_id`), tarefas (`tasks.contact_id`), atividades (`activities.contact_id`), threads/mensagens (via `useContactConversationsByContext`), documentos (`useContactDocuments`) — com a query real de cada um.
   - Quais campos são editáveis inline (owner, tags, lifecycle) vs. apenas via form (dados legais, endereço, canais).

6. **Criação / edição**
   - Campos mínimos obrigatórios (extraídos de `ContactForm.tsx` + NOT NULL do schema).
   - Fluxo de duplicidade: leitura de `organizations.duplicate_check_mode` (`off | warn | block`) e `duplicate_enforce_block`; matching por `phone_normalized` (usa `normalize_phone_br`) e email; UX mobile: warn = confirmação, block = bloqueia com CTA “abrir contato existente”.
   - Validações: telefone via `phoneUtils.ts` (normalização + 9º dígito BR). Para CPF/RG: vou verificar se existe helper equivalente; se não existir, documentar como `[TODO]` sem inventar.
   - Triggers relevantes que o mobile precisa saber (round-robin, `phone_normalized`, marketing FK, audit) — só citar impacto no cliente.

7. **Hooks e serviços a implementar no mobile** (espelho do web)
   - `useContactsList({ search, filters, page })`, `useContact(id)`, `useContactMutations()`, `useContactRelations(id)`, `useContactEndpoints(id)`, `useContactTags(id)`.
   - Assinaturas TypeScript, tratamento de erro, invalidação de cache.

8. **Código de referência (colado integralmente, sem resumo)**
   - `src/pages/contacts/ContactsList.tsx` (795 linhas)
   - `src/pages/contacts/ContactDetail.tsx` (908)
   - `src/pages/contacts/ContactForm.tsx` (588)
   - `src/hooks/contacts/useContactConversationsByContext.ts` (189)
   - `src/components/mobile/MobileContactsList.tsx` (209)
   - `src/lib/phoneUtils.ts`
   - Total ~2.7k linhas — o documento fica grande, mas é o padrão que você pediu (“cola tudo direto, sem resumir”).

9. **Checklist de implementação mobile** (o que o agente do app precisa fazer, em ordem).

10. **Incertezas e pendências** — lista consolidada de tudo que marquei `[INCERTO]` ou `[TODO]` durante a redação.

## Fora de escopo deste plano

- Nenhuma alteração em código, schema ou RLS.
- Nenhum novo endpoint/edge function.
- Não vou tocar em `src/lib/i18n.ts`, CRM autenticado, nem no app web.

## Perguntas antes de implementar

1. Confirma o caminho `docs/mobile/contacts-spec.md` (padrão da pasta) ou prefere mesmo `docs/MOBILE_CONTACTS.md` na raiz de `docs/`?
2. Ok colar os ~2.700 linhas de código integralmente no doc (arquivo ficará grande, ~120 KB)?
