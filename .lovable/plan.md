# Corrigir feedback visual da seleção na lista de contatos

## Problema identificado
A seleção está funcionando no estado: o replay mostra o contador de selecionados subindo quando você clica na linha. O erro é visual: a bolinha da linha não deixa claro que aquele contato foi selecionado.

## O que vou ajustar
1. **Corrigir o componente visual da bolinha da linha**
   - Revisar `src/components/application/table/table.tsx`, no `TableSelectionControl` e `TableCheckboxCell`.
   - Garantir que a seleção da linha tenha um estado visual explícito e forte: preenchimento verde real e/ou indicador interno visível.
   - Remover qualquer aparência nativa de botão que possa estar deixando o centro branco ou apagando o fundo selecionado.

2. **Separar visual do cabeçalho e da linha**
   - Manter o cabeçalho com estado `indeterminate` como está.
   - Dar à linha selecionada um estado próprio e inequívoco, para ficar óbvio qual contato foi marcado.

3. **Validar a ligação com o estado de seleção**
   - Confirmar em `src/pages/contacts/ContactsList.tsx` que `selectedIds.includes(contact.id)` continua sendo a fonte da verdade.
   - Garantir que o visual da bolinha reflita exatamente esse estado sem depender do contador inferior.

4. **Checar regressão no componente compartilhado**
   - Validar o uso do mesmo componente em outras tabelas para não quebrar seleção em oportunidades.

## Arquivos envolvidos
- `src/components/application/table/table.tsx`
- `src/pages/contacts/ContactsList.tsx`
- Validação em `src/pages/opportunities/OpportunitiesKanban.tsx`

## Detalhe técnico
Hoje o sintoma indica que o clique entra no estado, mas o controle visual da célula não está representando corretamente `checked=true`. A correção vai focar no componente compartilhado da tabela, reforçando o estado selecionado da linha com renderização visual consistente.