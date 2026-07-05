# Módulo: Contatos

## Rotas
- `/contacts` — listagem
- `/contacts/new` — criar
- `/contacts/:id` — detalhe
- `/contacts/:id/edit` — editar

Páginas: `src/pages/contacts/{ContactsList,ContactDetail,ContactForm}.tsx`.
Mobile: `src/components/mobile/`.

## Comportamentos-chave
- Unificação/merge de contatos duplicados — reassocia threads e histórico; auditoria em `contacts_merge_log`.
- Soft-delete propaga para oportunidades órfãs.
- Normalização de 9º dígito brasileiro no matching por telefone (`normalize_phone_br`, `src/lib/phoneUtils.ts`).
- Schema legal: CPF/RG/Endereço.
- Atribuição de responsável e auditoria created_by/updated_by.
- Tags via `tag_assignments` + componente `TagSelector`.
- Campos personalizados via `custom_field_definitions` + `custom_field_values`.

## Tabelas relacionadas
Ver `data-model.md`.
