# wizard-next-question

Path: `supabase/functions/wizard-next-question/index.ts` (440 LOC)

## Gatilho
- Chamada do frontend — computa a próxima pergunta do wizard behavioral.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `LOVABLE_API_KEY`

## Tabelas — LEITURA/ESCRITA
- Nenhuma no scan.

## APIs externas
- `https://ai.gateway.lovable.dev/v1/chat/completions`

## Observações
- 440 LOC concentradas em prompt e state machine textual. Bom candidato a modularizar prompts em `_shared/wizard/`.
