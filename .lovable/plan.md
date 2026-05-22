## Problema

Nas telas **Início (Dashboard)** e **Mensagens**, alguns filtros não são salvos quando o usuário sai e volta — diferente de Oportunidades/Contatos/Tarefas, que já usam `usePersistedFilters`.

## Análise

- **Dashboard (`src/pages/Dashboard.tsx`)**: usa `useState` puro para `preset` (período) e `customRange`. Sempre volta para "Últimos 30 dias" ao reentrar.
- **Mensagens (`src/pages/messages/MessagesList.tsx`)**: a aba `filter` (ThreadFilter) já é persistida, mas o campo de **busca** (`searchQuery`) usa `useState` puro e é perdido.

## Mudanças

### 1. `src/pages/Dashboard.tsx`
Trocar `useState` por `usePersistedFilters` (mesmo padrão do `useMarketingPeriod`):
- `dashboard.preset` → `PeriodPreset`
- `dashboard.custom` → `CustomRange | undefined` (com reviver que converte `from`/`to` para `Date`)

### 2. `src/pages/messages/MessagesList.tsx`
Trocar `useState('')` de `searchQuery` por `usePersistedFilters<string>('messages.search', '')`.

## Fora de escopo

- Não mexer no Dashboard mobile (`MobileDashboard`) a menos que também tenha filtro próprio — verificar rapidamente; se tiver, aplicar o mesmo padrão usando o mesmo scope `dashboard.preset` para compartilhar entre desktop/mobile.
- Nenhuma mudança de UI/visual, apenas persistência (localStorage por usuário + organização).
