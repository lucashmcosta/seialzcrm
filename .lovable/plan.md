Trocar o rótulo visível "Win Rate" por "Conversão" nos componentes do dashboard. Variáveis internas (`winRate`, `WinRateGauge`) ficam como estão para evitar churn.

**Arquivos:**
- `src/pages/reports/ReportsPage.tsx` — KPI label (linha 544) e título de seção/comentário.
- `src/components/reports/WinRateGauge.tsx` — `<h3>Win Rate</h3>` → `Conversão`.
- `src/components/reports/UserLeaderboard.tsx` — header da coluna (linha 118).
- `src/components/reports/UserDetailDialog.tsx` — label (linha 199).
- `src/components/mobile/MobileReports.tsx` — KPI label (linha 176) e sufixo `% win` (linha 306) → `% conv.`.

Fora de escopo: renomear variáveis/props/tipos internos e a coluna `win_rate` do Supabase.