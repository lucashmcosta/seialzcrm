# enhance-knowledge

Path: `supabase/functions/enhance-knowledge/index.ts` (193 LOC)

## Gatilho
- Chamada do frontend — enriquece/reescreve item de knowledge base via LLM antes de persistir.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `LOVABLE_API_KEY`

## Tabelas — LEITURA/ESCRITA
- Nenhuma no scan (retorna texto ao chamador que persiste).

## APIs externas
- `https://ai.gateway.lovable.dev/v1/chat/completions`

## Observações
- Segundo uso do Lovable AI Gateway. Reforça inconsistência de provider strategy entre AI functions.
