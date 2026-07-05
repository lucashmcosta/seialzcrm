# Lovable AI Gateway

**Referência técnica:** `docs/audit/04-integracoes/lovable-ai-gateway.md`.

## Finalidade
Fallback e roteamento para provedores LLM sem BYOK. Cobre chat, image, embeddings, TTS, STT.

## Env
`LOVABLE_API_KEY` (edge functions).

## Uso
- `ai-agent-respond` (fallback).
- `ai-generate`.

## Alternativa
BYOK — ver `integrations/byok/`.
