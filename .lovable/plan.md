# Ranking de vendedores: regra atual e correção da ordenação

## Regra atual (o que explica o caso da Luyza)

- A tabela ordena por **Valor Ganho (desc)** por padrão; qualquer coluna pode ser clicada para reordenar.
- Como praticamente todas as linhas estão com **Valor Ganho = R$ 0**, todas empatam. Nesse empate o navegador mantém a ordem em que as linhas vieram do banco, que não tem significado de performance. É por isso que Luyza (1 aberta, 0 ganhas, 0 perdidas) aparece acima de Ana Karoline (321 abertas, 1 ganha).
- Os troféus são dados simplesmente às 3 primeiras linhas da ordenação vigente, então hoje eles também premiam linhas empatadas em zero.
- Conversão da linha = Ganhas ÷ Criadas no período (não usa Abertas).

## Correção proposta (só apresentação, sem tocar em cálculo/banco)

1. Ordenação padrão passa a ser **Conversão (desc)** em vez de Valor Ganho — quem converte melhor no período lidera. As colunas continuam clicáveis.
2. Desempate determinístico: quando os valores da coluna escolhida empatam, ordenar em cascata por Conversão → Ganhas → Valor Ganho → Abertas → Nome (A-Z). Assim ninguém com 0/0/0 sobe na frente de quem tem ganhas.
3. Troféu só quando houver mérito: exibir troféu apenas nas 3 primeiras linhas cujo valor da coluna ordenada seja maior que zero; nas demais, mostrar a posição numérica.
4. Subtítulo do card indica o critério vigente, ex.: "Ordenado por Conversão".

Nada muda em KPIs, filtros, RPC, RLS ou regra de negócio. A conversão da linha continua sendo Ganhas ÷ Criadas no período.

## Detalhes técnicos

- `src/components/reports/UserLeaderboard.tsx`: estado inicial de `sort` para `{ key: 'winRate', dir: 'desc' }`; comparador com lista de desempate (`winRate`, `won`, `wonValue`, `open`, `fullName`) aplicado após a comparação da chave ativa; `trophyColor` passa a receber o valor da chave ativa da linha; rótulo da coluna ativa no subtítulo.
- Observação de dado (fora do escopo desta mudança): `Valor Ganho` sai zerado para todos porque as oportunidades ganhas do período estão sem valor preenchido — podemos investigar em separado.

