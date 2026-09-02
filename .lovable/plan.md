# Instrumentação `/dashboards` — causa raiz do runKey de 30 dias e da RPC que não dispara

Nada de RPC, SQL, RLS, índice ou regra de negócio. Só a camada de instrumentação.

## Cadeia real de propagação (verificada no código)

```text
UI (ReportFilters preset)                     ReportsPage.tsx:108  usePersistedFilters('reports.preset','last_30')
  -> range = computeRange(preset, customRange) ReportsPage.tsx:123  (useMemo)
  -> rangeKey                                  ReportsPage.tsx:124
  -> LEGADO: fetchData()                       ReportsPage.tsx:147-157, 185-210  (usa range.from/range.to)
  -> SHADOW: from=range.from, to=range.to,     ReportsPage.tsx:407-415  ready=!loading
     ownerId, ready
  -> runKey = org|from.toISOString()|to.toISOString()|owner
                                               useSalesDashboardStatsShadow.ts (buildRunKey)
  -> useEffect([runKey, ready])                dispara a RPC
```

Ponto importante: **legado e shadow leem o MESMO objeto `range`**. Não existe divergência de filtro entre os dois caminhos. Logo o intervalo de 30 dias no console não vem de propagação errada de filtro.

## Causa raiz 1 — o `runKey` de ~30 dias é um log obsoleto, não o filtro atual

`useSalesDashboardStatsShadow` imprime `hook mounted` dentro de uma guarda `mountLoggedRef` que só permite **uma única emissão em toda a vida do módulo/componente**:

```ts
const mountLoggedRef = useRef(false);
if (!mountLoggedRef.current && isParityMode()) { mountLoggedRef.current = true; console.log('[dashboard-test] hook mounted', ... runKey ...) }
```

Esse primeiro render acontece **antes da hidratação** de `usePersistedFilters`, quando `preset` ainda é o default `'last_30'` (ReportsPage.tsx:108). Resultado: o único `hook mounted` do console carrega para sempre o runKey de 30 dias (`2026-08-04 → 2026-09-03`), mesmo depois de a UI hidratar em 90 dias e o `runKey` mudar. O `RUN 4n34uy` dos logs do legado é outro run — o de 90 dias — e é o correto: 31 requests / 29.400 linhas são coerentes com 90 dias, não com 30.

Ou seja: **não há bug de filtro. Há um log emitido uma única vez, no estado pré-hidratação.**

## Causa raiz 2 — a RPC é bloqueada em silêncio pelo latch `rpcStarted`

No efeito do shadow:

```ts
if (run.rpcStarted) return;      // <- retorno silencioso, nenhum log
run.rpcStarted = true;
...
return () => { aborted = true; controller.abort(); };   // cleanup NÃO limpa rpcStarted
```

`ready` é `!loading`, e `loading` volta a `true` a cada `fetchData()` (ReportsPage.tsx:187). O console mostra **dois `LEGACY_DURATION_MS` (43.877 e 45.746) para o mesmo `RUN 4n34uy`**, o que prova que `fetchData()` rodou duas vezes para o mesmo run — portanto `ready` fez `true → false → true`.

Sequência que produz exatamente o sintoma observado:

1. legado #1 termina → `ready=true` → efeito roda → `rpcStarted=true`, RPC em voo;
2. legado #2 começa → `loading=true` → `ready=false` → cleanup: `aborted=true` + `controller.abort()`;
3. legado #2 termina → `ready=true` → efeito roda de novo → cai em `if (run.rpcStarted) return;` → **sai sem log nenhum**.

Como o `abort` também suprime qualquer log no `catch` (`if (aborted) return`), o resultado é ausência total de `RPC_START/RPC_END/RPC_CALL_COUNT/PARITY_RESULT` — o latch consumiu o run e nunca há segunda tentativa.

Se a corrida da etapa 2 acontecer antes mesmo do `console.log('rpc start')` (StrictMode desmonta e remonta o efeito no mesmo tick), nem `RPC_START` aparece. Nos dois casos a guarda de "exatamente 1x por run" está agindo como "no máximo 1 tentativa por run, mesmo que abortada".

## Correção mínima proposta

Só em `src/lib/dashboardParityRun.ts` e `src/hooks/useSalesDashboardStatsShadow.ts`.

1. **Latch por conclusão, não por tentativa.** Trocar `rpcStarted: boolean` por estado tri-valorado no `RunRecord` (`rpcState: 'idle' | 'running' | 'done'`). O cleanup por abort volta o estado para `'idle'`; `'done'` (sucesso ou erro logado) continua bloqueando reexecução. Assim `RPC_CALL_COUNT` continua garantidamente 1 por run.
2. **Nenhum retorno silencioso.** Todo caminho de saída do efeito loga o motivo: `rpc skipped reason=already done`, `reason=in flight`, `reason=not ready`, `reason=no runKey`, e `rpc aborted` no cleanup quando havia chamada em voo.
3. **`hook mounted` deixa de ser once-por-vida.** Passa a logar a cada mudança de `runKey`/`ready` (via `useRef` do último valor logado), com `preset`/`filtersHydrated` incluídos, para que o console sempre mostre o runKey vigente.
4. **Ignorar o run pré-hidratação.** `ReportsPage` passa `filtersHydrated` ao hook; enquanto `false`, o hook não cria run nem dispara RPC — elimina o run fantasma de `last_30` e o ruído que gerou esta confusão.

Nenhuma mudança em query, filtro, cálculo, RPC ou banco. Depois de aplicado, um único run de 90 dias já basta para fechar a medição.
