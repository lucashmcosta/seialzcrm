# knowledge-edit

Path: `supabase/functions/knowledge-edit/index.ts` (259 LOC)

## Gatilho
- Chamada do frontend — usa LLM para propor edições em item de knowledge e grava como request pendente.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`

## Tabelas — LEITURA
- `users`, `products`, `knowledge_items`

## Tabelas — ESCRITA
- `knowledge_edit_requests` (insert)

## APIs externas
- `https://ai.gateway.lovable.dev/v1/chat/completions`

## Observações
- Fluxo: aqui gera → `apply-knowledge-edit` persiste com histórico.
