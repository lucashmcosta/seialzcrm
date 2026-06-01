# Etapa 2 — Remoção do InboxSmokePanel

## Escopo
Apenas remoção do painel DEV de smoke tests. Sem tocar em `/inbox`, `/messages`, RPCs, migrations ou edge functions.

## Mudanças

1. **Deletar arquivo**
   - `src/pages/dev/InboxSmokePanel.tsx`

2. **Editar `src/App.tsx`**
   - Remover bloco de lazy import condicional:
     ```ts
     const InboxSmokePanel = import.meta.env.DEV
       ? lazy(() => import("./pages/dev/InboxSmokePanel"))
       : null;
     ```
   - Remover a rota condicional `/dev/inbox-smoke` (bloco `{InboxSmokePanel && <Route ... />}`).

3. **Verificação**
   - Rodar `rg "InboxSmokePanel|/dev/inbox-smoke"` para confirmar zero referências residuais.

## Não fazer
- Nenhuma alteração em `/inbox`, `/messages`, RPCs, migrations, edge functions.
- Não iniciar Fase 1.1 nem Migration 2B.
- Não modificar regras de escopo Atendimento vs Comercial.
