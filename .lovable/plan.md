## Diagnóstico

Erro: `Failed to fetch dynamically imported module: .../assets/TasksList-BKcatQ5k.js`

Trata-se do padrão já conhecido de **stale chunk após deploy**: a sessão do usuário carregou o `index.html` antes de um deploy novo, guardou a referência ao chunk `TasksList-BKcatQ5k.js`, e quando ele clicou em `/tasks` (visível no breadcrumb `navigation from /opportunities to /tasks`) o CDN já servia o bundle novo, sem esse hash.

## Estado da blindagem atual

Já implementado em turnos anteriores e ainda em vigor:

- `retryImport` envolve todos os 61 `lazy()` do `App.tsx` (inclusive `TasksList`).
- Guards globais em `src/main.tsx` interceptam `Failed to fetch dynamically imported module` antes do React.
- `SentryFallback` dispara reload resiliente.
- Reset de flags no `pageshow` para lidar com bfcache.

## Conclusão

Nada a fazer no código. O bundle atual já cobre o cenário: em uma nova sessão o hash de `TasksList` é o vigente, e sessões antigas se auto-corrigem no próximo reload disparado pelo fallback. O evento no Sentry é o registro esperado da captura — não uma regressão.
