
# Hotfix Fase 1.1 — coluna inexistente `contacts.name`

## Problema
Console mostra repetidamente:
```
[inboxScope] Query A error: column contacts_1.name does not exist
[inboxScope] Query B error: column contacts_1.name does not exist
```
A tabela `contacts` tem `full_name` (não `name`). Resultado: lista vazia ("Nenhuma conversa nesta fila") e contadores zerados, embora o SQL direto retorne 5 ativos.

Bug pré-existente também em `useInboxThread.ts` (detalhe da thread) — herdado do código antigo.

## Correção (mínima, dentro do escopo da Fase 1.1)

1. **`src/hooks/inbox/inboxScope.ts`** — nos dois SELECTs (A e B), trocar
   `contact:contacts ... ( id, name, phone, lifecycle_stage )`
   por alias PostgREST:
   `contact:contacts ... ( id, name:full_name, phone, lifecycle_stage )`
   Mantém o shape `{ id, name, phone, lifecycle_stage }` consumido pelos componentes — zero mudança no front.

2. **`src/hooks/inbox/useInboxThread.ts`** — mesmo alias em `THREAD_SELECT`:
   `contact:contacts ( id, name:full_name, phone )`.
   Bug antigo do detalhe da thread; corrigido junto porque trava o item 5 do checklist de QA.

## Não tocar
- `/messages`, RPCs, migrations, edge functions, RLS.
- Regra de escopo, abas, toggle, chips.
- Migration 2B, Fase 1.2.

## Validação
- Recarregar `/inbox`: contadores devem ler **Ativos=5, Aguardando=0, Concluídos hoje=0** e a lista deve mostrar 5 conversas.
- Abrir uma thread: nome deve aparecer no header.
- Console: nenhum erro `[inboxScope]`.

## Rollback
Reverter os 2 arquivos.
