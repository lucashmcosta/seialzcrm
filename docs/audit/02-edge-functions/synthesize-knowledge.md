# synthesize-knowledge

Path: `supabase/functions/synthesize-knowledge/index.ts` (554 LOC)

## Gatilho
- Chamada do frontend — sintetiza/consolida múltiplos itens de knowledge em resumo unificado.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `LOVABLE_API_KEY`

## Tabelas — LEITURA/ESCRITA
- Nenhuma no scan — provavelmente recebe conteúdo do chamador. [INCERTO]

## APIs externas
- `https://ai.gateway.lovable.dev/v1/chat/completions`

## Observações
- Function grande (554 LOC) sem acesso a tabelas visível no scan — quase toda lógica é prompt engineering. Vale extrair prompts para arquivo dedicado.
