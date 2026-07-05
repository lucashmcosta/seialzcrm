# Módulo: Contatos

## Rotas
- `/contacts` — listagem
- `/contacts/new` — criar
- `/contacts/:id` — detalhe
- `/contacts/:id/edit` — editar

Páginas: `src/pages/contacts/{ContactsList,ContactDetail,ContactForm}.tsx`.
Mobile: `src/components/mobile/` (memory `features/mobile/contacts-view-ui`).

## Comportamentos-chave
- Unificação/merge (memory `contacts/unification-strategy`) — relaciona threads e histórico.
- Soft-delete propaga para oportunidades órfãs (memory `features/opportunities/soft-delete-propagation`).
- Normalização de 9º dígito brasileiro no matching por telefone (memory `contacts/brazilian-9th-digit-normalization`).
- Schema legal: CPF/RG/Endereço (memory `contacts/legal-and-address-schema`).
- Atribuição de responsável e auditoria created_by/updated_by.
- Tags via `tag_assignments` + componente `TagSelector`.
- Campos personalizados via `custom_field_definitions` + `custom_field_values`.

## Tabelas relacionadas
Ver `data-model.md`.
