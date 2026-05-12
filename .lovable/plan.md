## Objetivo

Corrigir o contador das colunas em Oportunidades para que, **quando houver filtro/busca por nome**, ele mostre a quantidade **filtrada**, e não o total bruto da etapa.

## Problema atual

Hoje o header da coluna usa `stageCounts[stage.id].count`, que vem do total agregado do banco.
Isso ignora o resultado de `searchResults` e por isso, ao filtrar por `Victoria`, a coluna continua mostrando algo como `189` mesmo sem existir 189 cards da Victoria naquela etapa.

## O que vai mudar

### 1. Ajustar o contador das colunas no desktop
Arquivo: `src/pages/opportunities/OpportunitiesKanban.tsx`

- Nos dois renders do Kanban (Seialz e legado), alterar a lógica do número exibido no header da coluna.
- Regra nova:
  - **se houver busca/filtro ativo**, mostrar `stageOpportunities.length`
  - **se não houver busca/filtro**, manter `stageCounts[stage.id]?.count`
- Aplicar a mesma regra ao valor monetário da coluna:
  - filtrado: soma dos cards filtrados
  - sem filtro: total agregado já existente

### 2. Definir claramente quando a tela está “filtrada”
Ainda em `src/pages/opportunities/OpportunitiesKanban.tsx`

Criar uma condição centralizada, algo como:
- busca ativa (`searchResults !== null`)
- ou qualquer filtro ativo (`activeFiltersCount > 0`)

Essa condição será usada para decidir se o header mostra:
- total filtrado/visível
- ou total geral da etapa

### 3. Manter comportamento atual sem filtro
Sem busca e sem filtros:
- o contador continua mostrando o total real da etapa no banco
- o scroll infinito continua igual
- nenhum ajuste de banco ou RPC será feito

## Resultado esperado

Ao buscar por `Victoria`:
- cada coluna passa a exibir a quantidade real de cards da Victoria naquela etapa
- o valor da etapa também acompanha apenas os cards filtrados
- ao limpar a busca, os totais gerais voltam a aparecer

## Escopo

Incluído:
- correção do contador da coluna quando há filtro/busca
- correção do valor da coluna quando há filtro/busca

Fora do escopo:
- mudanças em banco, RPC ou migrations
- alteração da lógica de paginação/infinite scroll
- mudanças na página `/reports`, exceto se ela reutilizar exatamente esse mesmo componente