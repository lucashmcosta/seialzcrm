# Smoke Test Panel — DEV-only (escopo revisado)

Adicionado: campo `thread_open_2` separado para T7 e output enriquecido (usuário logado, nome do teste, RPC, args, data, error, snapshots, expected, PASS/FAIL).

## Arquivos

### 1. `src/pages/dev/InboxSmokePanel.tsx` (novo)
- Componente único, usa `<Layout>` (CRM) e `supabase` real
- 4 inputs: `thread_open`, `thread_open_2` (opcional, fallback p/ `thread_open`), `thread_resolved`, `user_target` — pré-preenchidos via querystring e re-sincronizados
- Cabeçalho fixo mostra `user.email` + `user.id` do `useAuth()`
- 4 botões: T5, T6, T7, T10a (+ Clear results)
- Helper `snap(threadId)`:
  - `message_threads`: id, status, assigned_user_id, last_message_at
  - `thread_assignment_history`: id, **action_type**, from_user_id, to_user_id, reason, created_at (limit 5, desc)
- Mapeamento RPC (parâmetros conforme migration 2A):
  - T5 → `take_over_thread({_thread_id: thread_open, _reason})`
  - T6 → `take_over_thread({_thread_id: thread_resolved, _reason})`
  - T7 → `reassign_thread({_thread_id: thread_open_2 || thread_open, _to_user_id: user_target, _reason})`
  - T10a → `take_over_thread({_thread_id: thread_open, _reason})` (esperado falhar)
- Para cada execução, card renderiza: nome do teste, RPC, badge PASS/FAIL, `ran at` + usuário, expected, e 5 blocos `<pre>`: args, data, error, thread snapshot, history snapshot
- Heurística PASS/FAIL:
  - T5: `!error && thread.status === 'in_progress'`
  - T6: erro com `thread_closed_reopen_required`
  - T7: `!error && thread.assigned_user_id === user_target`
  - T10a: erro com `forbidden_permission`
- Tokens semânticos apenas (`bg-card`, `bg-muted/30`, `bg-primary`, `bg-destructive`), sem cores hardcoded, sem `p-8`

### 2. `src/App.tsx` (edit cirúrgico)
- Adicionar abaixo do lazy `ImpersonateCallback`:
  ```tsx
  const InboxSmokePanel = import.meta.env.DEV
    ? lazy(() => import("./pages/dev/InboxSmokePanel"))
    : null;
  ```
- Dentro de `<Routes>`, junto às rotas CRM:
  ```tsx
  {InboxSmokePanel && (
    <Route
      path="/dev/inbox-smoke"
      element={<ProtectedRoute><InboxSmokePanel /></ProtectedRoute>}
    />
  )}
  ```
- Produção: variável é `null` → rota não registrada → cai no `NotFound`

### 3. `src/main.tsx` (revert do guard anterior)
- Remover as 6 linhas que expunham `window.sb` (import do supabase + bloco `if (import.meta.env.DEV)`)

## Uso

```
/dev/inbox-smoke?thread_open=<id>&thread_open_2=<id>&thread_resolved=<id>&user_target=<id>
```

1. Autenticado como Camila (admin) → rodar T5, T6, T7 → conferir PASS
2. Logout, login como Luana (sem permissão) → rodar T10a → conferir PASS

## Reversão (mesmo ciclo, após os 4 PASS)

- Deletar `src/pages/dev/InboxSmokePanel.tsx`
- Em `src/App.tsx`: remover o lazy `InboxSmokePanel` + a rota condicional

## Restrições

- ❌ Sem migration nova, sem alteração em RPCs, sem mudança em regras de negócio, sem mudar `client.ts`
- ✅ Painel isolado, removível sem efeito colateral
- 🔒 Migration 2B continua bloqueada até o revert do painel ser confirmado
