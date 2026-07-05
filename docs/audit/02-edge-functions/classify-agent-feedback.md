# classify-agent-feedback

Path: `supabase/functions/classify-agent-feedback/index.ts` (272 LOC)

## Gatilho
- Chamada do frontend (ou worker) — classifica feedback humano sobre resposta do agente (categorias/severidade).

## Imports de `_shared/`
- Nenhum.

## Env vars
- `LOVABLE_API_KEY`

## Tabelas — LEITURA/ESCRITA
- Nenhuma capturada no scan — [INCERTO], provavelmente escreve em `ai_agent_logs` ou tabela de feedback; scan pode ter perdido acessos indiretos.

## APIs externas
- `https://ai.gateway.lovable.dev/v1/chat/completions` (Lovable AI Gateway)

## Observações
- Único uso claro do Lovable AI Gateway entre as functions AI (as demais chamam Anthropic/OpenAI diretamente).
