# Auditoria sentinela — cadeia `/dashboards` → paridade

## Achados confirmados antes da alteração

- **Módulo afetado:** Dashboard Comercial, somente instrumentação temporária de diagnóstico no frontend.
- **Documentação consultada:** `docs/README.md`, `docs/STATUS.md`, `docs/product/navigation-map.md`, `docs/product/modules.md`, `docs/operations/conflicts.md` e drift de chunks de 2026-07-31.
- **ADR aplicável:** nenhum para esta instrumentação; não há mudança arquitetural ou de regra de negócio.
- **Banco, RLS, Edge Functions, integrações externas e multi-tenancy:** não serão tocados.
- `src/App.tsx` importa estaticamente `./pages/reports/ReportsPage` e a rota autenticada `/dashboards` renderiza esse componente.
- Existe **uma única definição** de `ReportsPage` em `src/`.
- Esse `ReportsPage` importa e chama `useSalesDashboardStatsShadow`.
- O hook importa `dashboardParityRun.ts`.
- Os três arquivos acima estão sendo servidos pelo Vite ao Preview com essa cadeia de imports.
- Não existe feature flag, lazy loading ou condição de build entre `/dashboards` e `ReportsPage`; somente o guard normal de autenticação da rota.
- Há drift documental: `docs/product/modules.md` aponta `/dashboards` para `src/pages/Dashboard.tsx`, mas a rota viva em `src/App.tsx` aponta para `src/pages/reports/ReportsPage.tsx`. Para este diagnóstico, o código da rota é a evidência válida.
- O build atual está OK. Os logs pedidos ainda não existem no topo dos módulos; os heartbeats atuais dependem de `isParityMode()`, portanto não conseguem provar onde a importação para.

## Implementação mínima

Adicionar exatamente três sentinelas, todos com `console.log`, sem alterar condições, efeitos, chamadas, filtros ou comportamento:

1. No topo de `src/lib/dashboardParityRun.ts`, fora de qualquer função:
   - `PARITY_MODULE_IMPORTED`
2. No topo de `src/hooks/useSalesDashboardStatsShadow.ts`, fora do hook:
   - `SHADOW_HOOK_IMPORTED`
3. Na primeira linha executável do componente `ReportsPage`, antes do primeiro hook:
   - `REPORTS_PAGE_MOUNTED`

## Verificação no Preview

1. Abrir uma sessão nova do Preview, preservar `localStorage.parityMode = '1'`, navegar diretamente para `/dashboards` e fazer recarga completa.
2. Capturar o console do iframe da aplicação desde o carregamento inicial.
3. Registrar objetivamente uma matriz `apareceu / não apareceu` para os três sentinelas.
4. Usar a primeira quebra para localizar a cadeia:

```text
PARITY_MODULE_IMPORTED
  └─ SHADOW_HOOK_IMPORTED
       └─ REPORTS_PAGE_MOUNTED
```

Como `ReportsPage` importa os outros dois módulos, num carregamento novo a ordem esperada de avaliação é módulo de paridade → módulo do hook → montagem da página. Qualquer ausência será reportada como evidência, sem nova hipótese ou correção comportamental.

## Arquivos tocados

- `src/lib/dashboardParityRun.ts`
- `src/hooks/useSalesDashboardStatsShadow.ts`
- `src/pages/reports/ReportsPage.tsx`

Nenhum outro arquivo e nenhuma alteração de comportamento.
