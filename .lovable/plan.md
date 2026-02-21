
# Atribuição de Responsavel em Contatos e Oportunidades

## Situacao Atual

O campo `owner_user_id` ja existe no banco de dados para `contacts` e `opportunities`, mas:
- Nenhum formulario permite definir/alterar o responsavel
- A tela de detalhe do contato nao mostra quem e o responsavel
- A tela de detalhe da oportunidade mostra o nome do responsavel, mas nao permite alterar
- Ao criar contato ou oportunidade, o responsavel fica vazio (null)

## O que sera implementado

### 1. Componente reutilizavel: OwnerSelector

Um select dropdown que carrega os usuarios da organizacao e permite escolher o responsavel. Sera usado em todos os pontos abaixo.

- Busca usuarios via `user_organizations` + `users` filtrando pela org ativa
- Mostra avatar + nome
- Opcao "Sem responsavel" para limpar
- Arquivo: `src/components/common/OwnerSelector.tsx`

### 2. Formulario de Contato — campo de responsavel

- Adicionar o `OwnerSelector` no `ContactForm.tsx`
- Ao criar, define o responsavel como o usuario logado por padrao
- Ao editar, carrega o responsavel atual e permite alterar
- Salva o `owner_user_id` no insert/update

### 3. Tela de Detalhe do Contato — mostrar e alterar responsavel

- No `ContactDetail.tsx`, na area de detalhes, adicionar uma linha mostrando o responsavel atual
- Clicar no nome abre o `OwnerSelector` inline para trocar rapidamente
- A troca salva direto no banco sem precisar ir no formulario de edicao

### 4. Dialog de Oportunidade — campo de responsavel

- Adicionar o `OwnerSelector` no `OpportunityDialog.tsx`
- Ao criar, define o responsavel como o usuario logado por padrao
- Ao editar, carrega o responsavel atual
- Salva o `owner_user_id` no insert/update

### 5. Tela de Detalhe da Oportunidade — alterar responsavel inline

- No `OpportunityDetail.tsx`, onde ja mostra `opportunity.users?.full_name`, transformar num selector clicavel
- Permite trocar o responsavel direto sem abrir o dialog de edicao

---

## Detalhes tecnicos

### Componente OwnerSelector

```
Arquivo: src/components/common/OwnerSelector.tsx

Props:
- value: string | null (owner_user_id atual)
- onChange: (userId: string | null) => void
- size?: 'sm' | 'default'

Query:
  SELECT u.id, u.full_name, u.avatar_url
  FROM users u
  JOIN user_organizations uo ON uo.user_id = u.id
  WHERE uo.organization_id = org.id AND uo.is_active = true
```

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/components/common/OwnerSelector.tsx` | Novo componente de select de responsavel |
| `src/pages/contacts/ContactForm.tsx` | Adiciona campo OwnerSelector, default = usuario logado |
| `src/pages/contacts/ContactDetail.tsx` | Mostra responsavel + selector inline para trocar |
| `src/components/opportunities/OpportunityDialog.tsx` | Adiciona campo OwnerSelector no formulario |
| `src/pages/opportunities/OpportunityDetail.tsx` | Transforma nome do owner em selector clicavel |

### Nenhuma migracao necessaria

Os campos `owner_user_id` ja existem em ambas as tabelas com foreign key para `users`. Nao precisa alterar o banco.

### Fluxo do usuario

1. Cria contato -> responsavel ja vem preenchido com seu nome
2. Na lista, ve a coluna de responsavel (ja existe)
3. No detalhe do contato, ve e pode trocar o responsavel com 1 clique
4. Mesma logica para oportunidades
5. Bulk actions de atribuicao continua funcionando como ja funciona
