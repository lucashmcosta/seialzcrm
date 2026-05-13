## Diagnóstico

A lógica de seleção já está correta no código:
- Clicar na bolinha do cabeçalho → seleciona todos os contatos da página atual.
- Clicar na bolinha de um contato → seleciona só aquele.
- Clicar de novo no cabeçalho → desmarca tudo.

O que está atrapalhando é a aparência:
1. As bolinhas são quase invisíveis (`border` muito sutil), parecem ícone de status, não checkbox.
2. A barra inferior mostra "1 Selecionar" — texto errado, deveria ser "1 selecionado".
3. Quando só 1 contato está marcado e o cabeçalho fica "—" (parcial), não fica claro que clicar nele vai marcar todos.

## Solução simples

**1. `src/components/BulkActionsBar.tsx`** — corrigir o label:
- Trocar `{N} Selecionar` por `{N} selecionado` / `{N} selecionados` (singular/plural).

**2. `src/pages/contacts/ContactsList.tsx`** — melhorar a UX da seleção em massa:
- Adicionar `title="Selecionar todos desta página"` no checkbox do cabeçalho.
- Garantir que clicar no cabeçalho quando está "—" (parcial) seleciona todos (já é o comportamento padrão do Radix).

**3. `src/components/ui/checkbox.tsx`** — deixar a bolinha mais visível:
- Aumentar contraste da borda (`border-2 border-muted-foreground/40`) para parecer um checkbox real, não um ícone decorativo.
- Manter o tamanho atual (`h-4 w-4`).

Nenhuma mudança em backend, dados ou rotas.

## Arquivos afetados

- `src/components/BulkActionsBar.tsx`
- `src/components/ui/checkbox.tsx`
- `src/pages/contacts/ContactsList.tsx` (apenas atributo `title` no header checkbox)
