# Corrigir seleção individual dos contatos

## Problema identificado
Quando você clica no checkbox de um contato específico, o estado de seleção é atualizado, mas o feedback visual fica errado: o checkbox do cabeçalho entra em estado misto e a bolinha da linha clicada não pinta corretamente.

## O que vou ajustar
1. **Isolar o checkbox da linha no componente de tabela**
   - Revisar `src/components/application/table/table.tsx` para impedir que foco, press e click do checkbox da linha interfiram no comportamento da `TableRow` do React Aria.
   - Garantir que o clique na bolinha da linha afete apenas aquele checkbox.

2. **Corrigir a atualização visual da linha selecionada**
   - Ajustar o `TableCheckboxCell` para refletir imediatamente o estado `isSelected` da linha clicada.
   - Manter o checkbox do cabeçalho apenas como reflexo agregado da seleção (`selecionado`, `indeterminado`, `vazio`).

3. **Validar a integração na lista de contatos**
   - Conferir `src/pages/contacts/ContactsList.tsx` para manter a seleção individual via `handleSelectOne` sem impactar navegação da linha.
   - Validar também que o “selecionar todos” continua funcionando como antes.

4. **Evitar regressão em outras tabelas**
   - Verificar o uso do mesmo componente em oportunidades para garantir que a correção no componente compartilhado não quebre a seleção lá.

## Arquivos envolvidos
- `src/components/application/table/table.tsx`
- `src/pages/contacts/ContactsList.tsx`
- Validação em `src/pages/opportunities/OpportunitiesKanban.tsx`

## Detalhe técnico
A tabela usa seleção manual por estado (`selectedIds`) e não a seleção nativa do React Aria. O problema está na interação entre `Row onAction` e o checkbox Radix embutido dentro da célula. A correção será feita no componente compartilhado de checkbox da tabela, preservando o design system atual e sem mudar a lógica de negócio da lista.