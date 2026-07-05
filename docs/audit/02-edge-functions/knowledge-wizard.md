# knowledge-wizard

Path: `supabase/functions/knowledge-wizard/index.ts` (337 LOC)

## Gatilho
- Chamada do frontend — wizard conversacional que gera itens de knowledge via LLM.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `LOVABLE_API_KEY`

## Tabelas — LEITURA/ESCRITA
- Nenhuma no scan (retorna sugestões; persistência via outras functions).

## APIs externas
- `https://ai.gateway.lovable.dev/v1/chat/completions`

## Observações
- Relacionada a `wizard-next-question` e `wizard-generate-content` — trio poderia ser um único endpoint parametrizado.
