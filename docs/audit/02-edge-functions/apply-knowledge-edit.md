# apply-knowledge-edit

Path: `supabase/functions/apply-knowledge-edit/index.ts` (288 LOC)

## Gatilho
- Chamada do frontend — aplica um `knowledge_edit_request` aprovado a `knowledge_items`.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `users`, `knowledge_edit_requests` (múltiplas), `knowledge_items`

## Tabelas — ESCRITA
- `knowledge_items` (insert/update)
- `knowledge_item_history` (insert — versionamento)
- `knowledge_edit_requests` (update — status applied)

## APIs externas
- Nenhuma.

## Observações
- Boa separação: edição sugerida (`knowledge-edit`) x aplicação da edição (esta). Mantém audit trail em `knowledge_item_history`.
