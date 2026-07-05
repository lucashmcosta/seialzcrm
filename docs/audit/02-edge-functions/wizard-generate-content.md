# wizard-generate-content

Path: `supabase/functions/wizard-generate-content/index.ts` (209 LOC)

## Gatilho
- Chamada do frontend — gera conteúdo final do wizard (behavioral wizard 5 steps, ver `mem://features/ai-agent/wizard-architecture-and-versioning`).

## Imports de `_shared/`
- Nenhum.

## Env vars
- `LOVABLE_API_KEY`

## Tabelas — LEITURA/ESCRITA
- Nenhuma no scan.

## APIs externas
- `https://ai.gateway.lovable.dev/v1/chat/completions`

## Observações
- Ver duplicação com `knowledge-wizard` e `wizard-next-question`.
