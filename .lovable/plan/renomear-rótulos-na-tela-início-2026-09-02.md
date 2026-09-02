# Renomear rótulos na tela Início

Trocar, apenas na apresentação da tela Início (Dashboard), os termos:

- "Entradas" / "Oportunidades que entraram" → **Criadas**
- "Fechadas" / "Fechamentos" / "Oportunidades fechadas" → **Ganhas**

Nenhuma mudança de cálculo, filtro, banco ou lógica — só texto.

## O que muda

1. Rótulos dos KPIs (usados no desktop e no mobile da tela Início):
   - `dashboard.entered`: "Oportunidades que entraram" → "Criadas"
   - `dashboard.closed`: "Oportunidades fechadas" → "Ganhas"
   - Equivalentes em inglês: "Created" e "Won"
2. Gráfico "Entradas x Fechamentos" da tela Início:
   - Título → "Criadas x Ganhas"
   - Séries da legenda/tooltip → "Criadas" e "Ganhas"
3. Detalhe da lista de oportunidades na tela Início: "Fechada em {data}" → "Ganha em {data}"

## Detalhes técnicos

- `src/lib/i18n.ts`: strings `dashboard.entered` e `dashboard.closed` (pt-BR e en-US).
- `src/components/reports/DashboardTrendChart.tsx`: título, chaves das séries e `dataKey` das linhas.
- `src/pages/Dashboard.tsx`: texto "Fechada em".
- Chaves de estado/código (`entered`, `closed`) permanecem como estão.
