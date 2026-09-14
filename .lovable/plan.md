# Eliminar o vão branco entre "Criadas x Ganhas" e "Criadas"

O cartão de Status (rosca + legenda) é mais alto que o cartão "Criadas x Ganhas". Como os dois estão lado a lado, o cartão da esquerda termina antes e sobra uma faixa branca grande acima do bloco "Criadas".

## O que muda

- O cartão "Criadas x Ganhas" passa a acompanhar a altura do cartão de Status: o gráfico cresce para preencher o espaço, e as bordas de baixo dos dois cartões ficam alinhadas.
- Some o vão branco entre a primeira faixa e o bloco Criadas/Ganhas/Conversão.
- No celular nada muda (continuam empilhados, altura natural).

Nenhuma mudança de dados, cores, filtros ou do botão Diária/Semanal.

## Detalhes técnicos

- `src/pages/Dashboard.tsx`: nas duas colunas da primeira faixa, aplicar `h-full` nos wrappers `lg:col-span-2` / `lg:col-span-1`.
- `src/components/reports/DashboardTrendChart.tsx`: cartão vira `flex h-full flex-col`; a área do gráfico troca `h-64` por `min-h-64 flex-1` (o esqueleto de carregamento acompanha).
