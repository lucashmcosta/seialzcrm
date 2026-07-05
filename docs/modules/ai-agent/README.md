# Módulo: Agente IA

Configurável em `/settings/ai-agent` e `/settings/ai-providers`.

## Comportamento (memories)
- Wizard behavioral em 5 passos + RAG estrito (`ai-agent/wizard-architecture-and-versioning`).
- Multi-model: Claude, OpenAI, Gemini — uniqueness por org (`multi-model-duplication`).
- Suporte a modelos de raciocínio + recuperação de resposta vazia (`model-compatibility-consolidated`).
- Limite de mensagens por agente por thread via `ai_agent_logs` (`message-limits-per-agent`).
- Memória de longo prazo + flow classifier (`memory-and-feedback-system`).
- Regras de segurança conversacional: sem botões numerados no texto, apenas templates nativos (`conversational-behavior-and-safety`).
- Regras anti-alucinação para pagamento PIX/link (`payment-tool-hardening`).
- Rerank Voyage top 30 → top 5 (`reranking-and-anti-hallucination-logic`).
- Visibilidade UI depende do provider ativo (`ui-visibility-logic`).
- Tools disponíveis: `create_task`, `schedule_follow_up` (via cron), `mark_name_asked`, memory writes.
- Retry exponencial em falhas Claude (`service-reliability-retry-logic`).
- Confirmação de nome via tool `mark_name_asked` (`name-confirmation-system`).
- Melhoria persuasiva de texto (`text-improvement-persuasive`).

## Edge functions
- Principal: `ai-agent-respond` (2372 LOC — 🔴 candidato a decomposição, ver dívida técnica).
- Ad-hoc: `ai-generate` (374 LOC).
- Suporte: `classify-agent-feedback`, `analyze-message`, `transcribe-audio`, `scheduled-messages-cron`.

## Providers / BYOK
Ver `integrations/byok/` e `integrations/lovable-ai-gateway/`. Override por org via `organization_integrations` e `intelligence_settings`.
