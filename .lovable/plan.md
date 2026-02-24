

# Adicionar "Criado por" e "Atualizado por" (colunas genericas)

## O que muda

Colunas com nomes genericos: `created_by` e `updated_by` (tipo UUID, nullable). Sem "user_id" no nome - nao indica se foi usuario ou sistema, e simplesmente quem fez.

- `NULL` = "Sistema"
- UUID preenchido = buscar nome na tabela `users`

---

## 1. Migracao de banco de dados

```sql
ALTER TABLE contacts ADD COLUMN created_by uuid;
ALTER TABLE contacts ADD COLUMN updated_by uuid;
ALTER TABLE opportunities ADD COLUMN created_by uuid;
ALTER TABLE opportunities ADD COLUMN updated_by uuid;
```

Sem foreign key formal. Colunas nullable. Registros existentes ficam NULL = "Sistema".

---

## 2. Contato (`src/pages/contacts/ContactDetail.tsx`)

- Apos carregar o contato, se `created_by` ou `updated_by` tiver valor, buscar nomes na tabela `users` com `.in('id', [ids])`
- Exibir no grid de detalhes (abaixo das datas ja existentes):
  - **Criado por** - icone `User`, nome ou "Sistema"
  - **Atualizado por** - icone `User`, nome ou "Sistema"

---

## 3. Oportunidade (`src/pages/opportunities/OpportunityDetail.tsx`)

- Mesma logica: buscar nomes se IDs existirem
- Exibir na aba overview, abaixo das datas

---

## 4. Salvar nos formularios

- **ContactForm** (`src/pages/contacts/ContactForm.tsx`): no insert, enviar `created_by: userProfile.id`
- **OpportunityDialog** (`src/components/opportunities/OpportunityDialog.tsx`): no insert, enviar `created_by: userProfile.id`
- Nos updates do ContactDetail e OpportunityDetail: enviar `updated_by: userProfile.id`

---

## Resumo

| Arquivo | Mudanca |
|---------|---------|
| Migracao SQL | 4 colunas: `created_by` e `updated_by` em `contacts` e `opportunities` |
| `src/pages/contacts/ContactDetail.tsx` | Buscar nomes, exibir "Criado por" e "Atualizado por" |
| `src/pages/opportunities/OpportunityDetail.tsx` | Buscar nomes, exibir "Criado por" e "Atualizado por" |
| `src/pages/contacts/ContactForm.tsx` | Enviar `created_by` ao criar |
| `src/components/opportunities/OpportunityDialog.tsx` | Enviar `created_by` ao criar |

