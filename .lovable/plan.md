## Mudanças

**Rota**
- `src/App.tsx`: trocar `path="/reports"` por `path="/dashboards"`. Adicionar redirect `/reports` → `/dashboards` para preservar links antigos.

**Navegação**
- `src/components/Layout.tsx` (2 ocorrências): atualizar `href: '/reports'` → `/dashboards`.
- `src/components/mobile/MobileLayout.tsx`: atualizar `label` e `href` para `Dashboards` / `/dashboards`.

**Labels (i18n)**
- `src/lib/i18n.ts`: renomear chave `nav.reports` para `nav.dashboards` (PT: "Dashboards", EN: "Dashboards"). Atualizar referências em Layout.tsx.

**Título da página**
- `src/pages/reports/ReportsPage.tsx`: trocar "Relatórios" por "Dashboards" no header (ícone mantido).

## Fora de escopo
- Renomear arquivos/pastas (`pages/reports/`, `ReportsPage.tsx`) — manter para evitar churn; só URL e labels mudam.
- Alterar conteúdo dos cards/relatórios em si.