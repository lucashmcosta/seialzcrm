# QA: Tela branca "Algo deu errado" após deploy — plano cirúrgico

Entendido. Vou tratar isso com o mesmo nível de cuidado de uma cirurgia: escopo mínimo, invariantes duras, zero mudança em qualquer caminho crítico (ligações, gravação de áudio, envio de WhatsApp, autenticação).

## Diagnóstico (verificado read-only nesta auditoria)

**Sintoma**: tela branca com "Algo deu errado" no canto superior esquerdo. Acontece quando um usuário está com aba aberta há um tempo, o app é republicado, e ao navegar para uma rota lazy o chunk (ex.: `ContactsList-XXXX.js`) não existe mais no CDN. React cai no `Sentry.ErrorBoundary`.

**Estado atual do sistema**:

1. `src/App.tsx` — tem `retryImport` + `reloadForChunkRecovery` + `isStaleChunkError`. Falha de chunk retorna Promise pendente e recarrega em silêncio. ✅
2. `src/main.tsx` — `SentryFallback` reconhece stale chunk e mostra `<PageLoader />` em vez do texto de erro. ✅
3. `src/instrument.ts` — `beforeSend` filtra eventos de stale chunk e os do `encoderWorker.umd.js`. ✅
4. `src/hooks/useVersionCheck.ts` — já existe polling de nova versão e helper `hardRefreshApp()`. ✅ (não vou tocar)

**Lacunas reais que causam a tela branca persistir**:

- **Lacuna A** — Nem todo `lazy()` em `src/App.tsx` passa por `retryImport`. Áreas descobertas:
  - Todos os `./components/settings/*` (22 arquivos)
  - Todos os `./pages/admin/*` (20 arquivos)
  - `pages/companies/*` (3), `pages/whatsapp/*` (3), `pages/settings/*` restantes (4)
  - `Profile`, `NotFound` (2)
- **Lacuna B** — `SentryFallback` mostra `PageLoader` no stale chunk, mas **não dispara reload**. Se `retryImport` não estava no caminho (Lacuna A), o usuário fica com spinner infinito.
- **Lacuna C** — Padrões de mensagem cobertos hoje não incluem: `error loading dynamically imported module` (Firefox), `unable to preload css` (Vite CSS preload).

Nada disso toca ligações, áudio, WhatsApp, Supabase, RLS ou edge functions.

## Invariantes duras (o que **NÃO** vai ser mexido)

1. **Zero mudança em ligações.** `InboundCallHandler`, `OutboundCallHandler`, `OutboundCallContext`, Twilio Voice SDK, hooks `useVoiceIntegration`, `useInboundCalls` — intocados. O `lazy()` desses dois handlers já usa `retryImport` desde antes, e permanece igual.
2. **Zero mudança em áudio/gravação.** `AudioRecorder.tsx`, `warmEncoder`, `opus-media-recorder`, workerOptions — intocados. O plano anterior (`.lovable/plan.md`) já foi aplicado e não é reaberto aqui.
3. **Zero mudança em envio de mensagens.** `dispatchWhatsAppSend`, `migrateThreadAndSend`, `evolution-whatsapp-send`, `useThreadSendEndpoint`, edge functions — intocados.
4. **Zero mudança em auth/context.** `AuthContext`, `OrganizationContext`, `AuthProvider`, sessão — intocados.
5. **Zero mudança em rotas.** Nenhum path muda; nenhum componente muda. Só o wrapper de import do `lazy()`.
6. **Zero mudança de dependência.** Nenhum `bun add`; nenhum lockfile alterado.
7. **Zero mudança em banco, edge functions, RLS, cron.**
8. **Reversível em um único revert.** Todas as mudanças ficam em 3 arquivos.

## Plano

### Arquivos tocados (só estes 3)

- `src/App.tsx` — declarações `const X = lazy(...)`. Nenhum uso do componente muda.
- `src/main.tsx` — só o corpo do `SentryFallback`.
- `src/instrument.ts` — só a lista `STALE_CHUNK_PATTERNS`.

### Mudança 1 — Wrap universal com `retryImport` (Lacuna A)

Em `src/App.tsx`, para cada `const X = lazy(() => import("...").then(...))` que **ainda não** usa `retryImport`, envolver o `import(...)` interno com `retryImport(...)`. A cadeia `.then(m => ({ default: m.X }))` que já existe é preservada literalmente. Rotas e componentes finais não mudam.

Antes:
```
const UsersSettings = lazy(() => import("./components/settings/UsersSettings").then(m => ({ default: m.UsersSettings })));
```
Depois:
```
const UsersSettings = lazy(() => retryImport(() => import("./components/settings/UsersSettings")).then(m => ({ default: m.UsersSettings })));
```

Lista exaustiva: todos os 22 `settings/*`, 20 `admin/*`, 3 `companies/*`, 3 `whatsapp/*`, 4 `settings/*` restantes, `Profile`, `NotFound`. Total: ~54 linhas modificadas, cada uma mecanicamente idêntica.

Por que é seguro: `retryImport` é passthrough em caminho feliz (`fn().catch(...)`). Se o import resolve, o comportamento é o mesmo. Só muda o caso de erro — que hoje é "explode" e passa a ser "reload silencioso". Zero impacto em qualquer coisa que não seja falha de rede em chunk.

### Mudança 2 — `SentryFallback` dispara reload (Lacuna B)

Em `src/main.tsx`, o `SentryFallback` passa a chamar `reloadForChunkRecovery()` (exportar de `App.tsx`) dentro de um `useEffect` quando detectar stale chunk. `PageLoader` continua sendo renderizado. Se o throttle (10s) bloquear o reload, cai num pequeno UI com botão "Recarregar agora" que chama `hardRefreshApp()` do `useVersionCheck.ts` (helper já existente, não vou reescrever).

Por que é seguro: `useEffect` só roda no branch `isStaleChunkError`. Nada muda para erros reais — continuam renderizando "Algo deu errado".

### Mudança 3 — Padrões adicionais (Lacuna C)

Em `src/App.tsx` (`isStaleChunkError`) e `src/instrument.ts` (`STALE_CHUNK_PATTERNS`), adicionar as duas strings:
- `error loading dynamically imported module`
- `unable to preload css`

As duas listas continuam sendo mantidas iguais (já é o padrão hoje).

Por que é seguro: só amplia o predicado de detecção. Não remove nada, não altera nenhum runtime.

## Validação (checklist obrigatório antes de considerar feito)

Vou executar cada item explicitamente:

1. `rg` para confirmar que todo `lazy(` em `src/App.tsx` tem `retryImport` embrulhando o `import(`. Contagem esperada: 0 `lazy(() => import(` sem `retryImport`.
2. `tsgo` para garantir que os wraps não quebraram nenhum tipo.
3. Build de produção sobe sem erro (o harness roda automaticamente).
4. **Smoke manual read-only dos caminhos críticos** (sem mexer): abrir a preview, navegar para uma rota que **antes** não tinha wrap (ex.: `/settings/users`, `/admin/organizations`), confirmar que abre normalmente. Nada muda no caminho feliz — a mudança só age em erro de fetch.
5. **Confirmação explícita de que não toquei em**:
   - `src/components/calls/*`
   - `src/contexts/OutboundCallContext.tsx`, `src/contexts/outbound-call/*`
   - `src/components/whatsapp/AudioRecorder.tsx`
   - `src/lib/dispatchWhatsAppSend.ts`, `src/lib/migrateThreadAndSend.ts`
   - qualquer `supabase/functions/*`
   - qualquer arquivo de rota/página em si

Se qualquer item da validação falhar, reverto imediatamente.

## Fora de escopo (registrado, não implementado)

- Banner "nova versão disponível" — `useVersionCheck` já existe e pode ser conectado num toast, mas isso é UX e fica para depois.
- Erros de destructuring `Invalid attempt to spread non-iterable` que aparecem no stack do evento — outra classe de bug, exige repro Sentry separado.
- Instrumentação Sentry em edge functions (dívida técnica antiga registrada em `docs/audit/04-integracoes/sentry.md`).

## Reversão

Se algo der errado em produção:
- Git revert dos 3 arquivos = estado atual (o de agora).
- Nenhum estado persistido, nenhuma migration, nenhuma mudança de contrato.
- `sessionStorage["__seialz_chunk_recovery_at"]` é auto-limpo e inofensivo se sobrar.

Aprova para eu entrar em build mode e aplicar?
