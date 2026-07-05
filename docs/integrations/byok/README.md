# BYOK (Bring Your Own Key) — Providers IA

**Referência técnica:** `docs/audit/04-integracoes/ai-providers-byok.md`.

## Finalidade
Permitir que cada org use suas próprias chaves de LLM (Claude, OpenAI, Gemini).

## Edge functions
- `byok-set-key` (84 LOC — arquitetura de referência: fino + lógica em `_shared/intelligence/byok-shared.ts`).
- `byok-rotate-key`, `byok-revoke-key`, `byok-test-key`, `byok-update-policy`.
- `migrate-legacy-ai-key` — migração de chaves antigas.

## Armazenamento
`organization_integrations` + `intelligence_settings`. Nunca `service_role_key` no frontend.

## Autz
`_shared/intelligence/authz.ts` (`requireOrgAdmin`) — só admin da org.

## Providers suportados
- Anthropic Claude
- OpenAI
- Gemini (Google)
- Voyage AI (embeddings/reranker) — override por org

Memory `features/ai-agent/multi-model-duplication` — uniqueness por org.
