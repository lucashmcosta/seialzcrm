## Diagnóstico

O erro `Cannot access 'Lt' before initialization` é um clássico **TDZ (Temporal Dead Zone)** do JavaScript minificado, causado por **dependência circular** entre módulos no bundle de produção (`index-BEYhe6zT.js`). Não é um bug de cache do navegador — o bundle publicado realmente contém a referência inválida.

O que aciona:

- `/reports` (ReportsPage) importa **eagerly** 7 componentes do diretório `src/components/reports/` (KpiCard, WinRateGauge, SalesTrendChart, PipelineFunnel, StageDistribution, UserLeaderboard, ReportFilters).
- `/dashboard` também importa `ReportFilters` do mesmo diretório.
- O Vite/Rollup junta tudo num único chunk grande. Quando esse chunk roda, há uma referência hoisted antes da inicialização (provavelmente o `recharts` puxado por `DashboardTrendChart`/`DashboardStatusDonut`, que estão no mesmo diretório e podem ser arrastados para o mesmo chunk em certas condições de tree-shaking).
- Em build de produção a ordem de execução muda e o `Lt` (variável minificada do recharts/chart helper) é referenciado antes de ser inicializado → **blank screen**.

## Solução profissional

1. **Code-split de todo o módulo de reports** (não só Dashboard). Cada página carrega seus próprios componentes via `lazy()` + `Suspense`, eliminando o chunk monolítico que dispara a TDZ.

2. **Manter `ReportFilters` como import síncrono** (é leve e usado por ambas as páginas) num arquivo isolado, sem reexports cruzados.

3. **Adicionar `manualChunks` no `vite.config.ts`** para garantir que `recharts` e os componentes de chart fiquem em chunks separados de UI/contextos. Isso previne TDZ e também melhora performance (recharts é ~150KB).

4. **Forçar rebuild limpo** após as mudanças para invalidar o hash `BEYhe6zT` do CDN.

## Arquivos a modificar

```text
src/pages/reports/ReportsPage.tsx
  - Converter KpiCard, WinRateGauge, SalesTrendChart, PipelineFunnel,
    StageDistribution, UserLeaderboard para lazy() com retryImport
  - Envolver área de conteúdo em <Suspense fallback={<ChartFallback/>}>
  - Manter ReportFilters como import síncrono

src/pages/Dashboard.tsx
  - Já lazy-loada DashboardTrendChart/Donut (OK, não mexer)
  - Manter ReportFilters síncrono (OK)

vite.config.ts
  - Adicionar build.rollupOptions.output.manualChunks:
      recharts → 'charts'
      @radix-ui/* → 'radix'
      react-day-picker + date-fns → 'datepicker'
```

## Por que isto resolve

- **TDZ desaparece**: cada componente vira seu próprio módulo carregado sob demanda; não há mais hoisting cruzado entre `recharts` e o resto do app no chunk principal.
- **Robusto a futuras edições**: mesmo que alguém adicione novo componente em `components/reports/`, ele entra em chunk próprio.
- **Sem mudança de UX**: `<Suspense>` mostra um skeleton idêntico ao `loading=true` que os componentes já têm.

## Validação após deploy

1. Hard reload em `/reports` → página renderiza sem erro.
2. DevTools → Network: vários chunks pequenos no lugar do bundle único.
3. Console limpo de `ReferenceError`.
