# Ajustar disposição dos três gráficos da tela Início

Os gráficos ficaram estreitos demais em três colunas. Nova disposição:

- Coluna da esquerda (2/3 da largura): **Criadas** em cima e **Ganhas** logo abaixo, empilhados.
- Coluna da direita (1/3 da largura): **Conversão**, na mesma posição de agora, ocupando a altura das duas.

No celular tudo continua empilhado, na ordem Criadas, Ganhas, Conversão.

Nenhuma mudança de dados, filtros, cores ou do botão Diária/Semanal.

## Detalhes técnicos

- `src/pages/Dashboard.tsx`: trocar o grid `md:grid-cols-3` por `lg:grid-cols-3`, com um wrapper `lg:col-span-2 flex flex-col gap-4` contendo Criadas e Ganhas, e Conversão em `lg:col-span-1`.
- `DashboardSingleMetricChart.tsx`: permitir altura configurável via prop opcional `height` (default atual `h-56`); Criadas/Ganhas usam altura menor (`h-44`) e Conversão altura maior (`h-[23rem]`) para alinhar as bordas dos cards.
