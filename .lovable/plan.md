# Variação de 0,0% em amarelo

O card Ganhas mostra 0,0% porque a comparação está correta: na semana passada foram 62 oportunidades ganhas e na semana anterior também 62. Empate = variação zero.

Mudança pedida: quando a variação for exatamente 0,0%, mostrar o traço e o número em amarelo, em vez de cinza.

## O que muda

1. Nos cards de KPI (usados em Início e Dashboards), a variação de 0,0% passa a usar a cor amarela de alerta do sistema, mantendo o traço horizontal como ícone.
2. Mesma mudança na versão mobile da tela Início, para não divergir.
3. Nada muda em cálculos, filtros, dados ou nas cores de alta (verde) e queda (vermelho).

## Detalhes técnicos

- `src/components/reports/KpiCard.tsx`: no `renderDelta`, trocar `text-muted-foreground` por `text-warning` no caso `isFlat`.
- `src/components/mobile/MobileDashboard.tsx`: mesma troca no bloco equivalente (linha ~130).
- `--warning` já existe nos temas; sem novos tokens.
