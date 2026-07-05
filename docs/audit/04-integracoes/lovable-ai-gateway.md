# Lovable AI Gateway

Endpoint: `https://ai.gateway.lovable.dev/v1/chat/completions`.

## Uso

- `classify-agent-feedback`
- `enhance-knowledge`
- `knowledge-edit`
- `synthesize-knowledge`
- `knowledge-wizard`, `wizard-next-question`, `wizard-generate-content`
- `transcribe-audio` (Whisper)

## Env vars

`LOVABLE_AI_API_KEY` (gateway padrão da plataforma).

## Observações

- Alternativa ao BYOK — cobre uso sem que a org precise trazer chave própria.
- Usado sempre para tarefas internas (não expostas ao end-user), mantendo BYOK só para respostas do agente.
