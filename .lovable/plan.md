# Ranking de vendedores: regra atual e correção da ordenação

## Regra atual (o que explica o caso da Luyza)

- A tabela ordena por **Valor Ganho (desc)** por padrão; qualquer coluna pode ser clicada para reordenar.
- Como praticamente todas as linhas estão com **Valor Ganho = R$ 0**, todas empatam. Nesse empate o navegador mantém a ordem em que as linhas vieram do banco, que não tem significado de performance. É por isso que Luyza (1 aberta, 0 ganhas, 0 perdidas) aparece acima de Ana Karoline (321 abertas, 1 ganha).
- Os troféus são dados simplesmente às 3 primeiras linhas da ordenação vigente, então hoje eles também premiam linhas empatadas em zero.
- Conversão da linha = Ganhas ÷ Criadas no período (não usa Abertas).

## Correção proposta (só apresentação, sem tocar em cálculo/banco)

1. Desempate determinístico na ordenação: quando os valores da coluna escolhida empatam, ordenar em cascata por Valor Ganho → Ganhas → Conversão → Abertas → Nome (A-Z).
2. Troféu só quando houver mérito: exibir troféu apenas nas 3 primeiras linhas **cujo valor da coluna ordenada seja maior que zero**; nas demais, mostrar a posição numérica.
3. Deixar explícito no subtítulo do card o critério vigente, ex.: "Ordenado por Valor Ganho", atualizando conforme a coluna clicada.

Nada muda em KPIs, filtros, RPC, RLS ou regra de negócio.

## Detalhes técnicos

- `src/components/reports/UserLeaderboard.tsx`: extrair um comparador com lista de desempate (`wonValue`, `won`, `winRate`, `open`, `fullName`) aplicado após a comparação da chave ativa; ajustar `trophyColor(idx)` para receber também o valor da chave ativa da linha; usar o rótulo da coluna ativa no subtítulo.
- Observação de dado (não escopo desta mudança): `Valor Ganho` sai zerado para todos porque as oportunidades ganhas do período estão sem valor preenchido — se quiser, podemos investigar isso em separado.
