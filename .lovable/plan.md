## Diagnóstico

Tentando salvar "Jose" com telefone **(74) 9920-4368** na org **Central Trabalhista**.

O banco tem um índice único `uniq_contacts_org_phone_normalized` em `(organization_id, phone_normalized)` que **sempre bloqueia** telefones repetidos, independentemente da config da organização.

Já existe um contato nessa org com o mesmo telefone:
- **🙏** (id `9c37a48e-8cdf-4ff8-a471-f9cf2739dc66`) — `+557499204368`

A organização está com `duplicate_check_mode = 'email'`, então a checagem do frontend em `ContactForm.tsx` (`checkDuplicates`) **só procura por email** e passa direto. Aí o insert vai pro banco, o índice único dispara erro 23505, e o frontend mostra apenas o toast genérico `"Erro"` — sem indicar que é duplicidade.

## O que vou fazer

Em `src/pages/contacts/ContactForm.tsx` (e mesma lógica no `ContactDetail` se houver edição inline com telefone):

1. **Sempre checar telefone duplicado** antes do insert/update (independente do `duplicate_check_mode`), comparando por `phone_normalized` via RPC simples ou query usando o E.164. Se existir, mostrar o card de duplicidade que já existe (com link "Abrir contato existente") em vez de tentar salvar.

2. **Tratamento do erro 23505 do Supabase** no `saveContact()`: se o erro retornar `code === '23505'` e `message` mencionar `phone_normalized`, exibir toast claro: *"Já existe um contato com este telefone nesta organização"* + abrir o card de duplicidade com o registro encontrado. Para outros erros, mostrar `error.message` no toast em vez do genérico `"Erro"`.

3. **Mesmo tratamento para email** caso o índice de email também dispare (defensivo).

Isso resolve o caso do Jose: o usuário vai ver que o telefone já pertence ao contato "🙏" e poderá abri-lo / mesclar / usar outro número, em vez de ficar com toast genérico sem saber o motivo.

### Arquivos afetados
- `src/pages/contacts/ContactForm.tsx` — checagem extra de telefone + parser de erro 23505 + mensagens detalhadas no toast.

Sem mudança de schema, sem mudança em outros fluxos.
