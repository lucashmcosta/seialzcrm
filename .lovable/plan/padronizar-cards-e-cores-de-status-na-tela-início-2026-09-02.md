# Padronizar cards e cores de status na tela Início

Dois objetivos, só apresentação: (1) os cards de KPI da Início passam a usar o mesmo componente/estilo dos cards da tela Dashboards; (2) uma paleta única de status aplicada em cards, gráfico e donut.

## Paleta de status (nova, única)

| Status | Cor |
|---|---|
| Criadas | Azul |
| Ganhas | Verde |
| Perdidas | Vermelho |
| Conversão | Laranja |
| Abertas | Amarelo |

Hoje "Criadas" e "Conversão" usam o verde primário e "Abertas" usa o verde primário no donut — é isso que causa a sensação de tudo verde.

## O que muda

1. **Cards da Início**: substituir os `Card` manuais por `KpiCard` (mesmo componente da tela Dashboards), mantendo os mesmos rótulos, valores, ícones, clique para abrir o detalhe e estado de carregamento.
2. **Cores dos cards da Início**: Criadas = azul, Ganhas = verde, Conversão = laranja.
3. **Gráfico "Criadas x Ganhas"**: linha Criadas em azul, Ganhas em verde.
4. **Donut "Status"**: Abertas = amarelo, Ganhas = verde, Perdidas = vermelho (fatias e legenda).
5. **Cards da Início no mobile**: mesmas três cores, para não divergir do desktop.

Nenhum cálculo, filtro, consulta, RPC, RLS ou regra de negócio é alterado.

## Detalhes técnicos

- Novos tokens semânticos em `src/index.css` para os três temas (claro, escuro, Seialz): `--info` / `--info-foreground` (azul) e `--orange` / `--orange-foreground` (laranja), em HSL. No tema Seialz o azul reaproveita o valor já existente `--sz-info` (#4488FF). Registrar `info` e `orange` em `tailwind.config.ts`. Amarelo usa o `warning` já existente.
- `src/components/reports/KpiCard.tsx`: estender o tipo `accent` com `info` e `orange` (cor do valor, halo e fundo do ícone), sem alterar os accents atuais.
- `src/pages/Dashboard.tsx`: trocar o bloco de cards manuais por `KpiCard` com `accent` `info` / `success` / `orange`.
- `src/components/reports/DashboardTrendChart.tsx`: `stroke` da série `created` para `hsl(var(--info))`.
- `src/components/reports/DashboardStatusDonut.tsx`: `STATUS_META.open.color` para `hsl(var(--warning))`.
- `src/components/mobile/MobileDashboard.tsx`: classes de cor dos três KPIs alinhadas à paleta.
- A tela Dashboards (`/dashboards`) fica fora do escopo desta mudança.
