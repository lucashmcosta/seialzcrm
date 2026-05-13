## Investigação

As alterações foram salvas no arquivo (`w-[232px]` e `line-clamp-2` confirmados via leitura), mas o screenshot mostra colunas ainda largas e título "Mário Do Nascimento Felix..." em 4 linhas. Possíveis causas:

1. **HMR não atualizou** o preview do Vite após o reload anterior.
2. **`line-clamp-2` perdendo efeito** dentro do `<h4>` que é `flex-1`. O `display:-webkit-box` do line-clamp pode ser sobrescrito pelo contexto flex do pai. Solução: aplicar o clamp num wrapper, não no elemento flex.
3. **Largura percebida**: 232px ainda parece larga pq o card é renderizado em viewport ampla. Reduzir mais (ex: 210px) deixa visivelmente mais finas.

## Mudanças propostas

### 1. `src/components/opportunities/SeialzOpportunityCard.tsx`

Reestruturar o título para garantir clamp:

- Remover `flex-1` do `<h4>`.
- Envolver o `<h4>` num `<div className="flex-1 min-w-0 pr-2">`.
- Aplicar `line-clamp-2` + `title={title}` no `<h4>` (sem `flex-1` nele).

Isso garante que o `<h4>` seja um bloco normal, com `display:-webkit-box` funcionando, e o wrapper flex cuida da largura. `min-w-0` é essencial pra clamp funcionar dentro de flex.

### 2. `src/pages/opportunities/OpportunitiesKanban.tsx`

Reduzir colunas Seialz de `w-[232px]` para `w-[210px]` (linhas 794 e 990) — diferença visível.

### 3. Forçar restart do dev server

Após as edições, chamar `restart_dev_server` pra garantir que o preview recarregue limpo, eliminando cache de HMR.

## Notas

- Sem mudança de lógica, só CSS/markup.
- Mantém tokens semânticos do design system Seialz.
- Não toca no kanban legado (não-Seialz) nem no mobile.
