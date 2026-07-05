# Módulo: Agente IA

Configurável em `/settings/ai-agent` e `/settings/ai-providers`.

## Comportamento
- Wizard behavioral em 5 passos + RAG estrito (versões em `ai_agent_versions`).
- Multi-model: Claude, OpenAI, Gemini — uniqueness por org.
- Suporte a modelos de raciocínio + recuperação de resposta vazia.
- Limite de mensagens por agente por thread via `ai_agent_logs`.
- Memória de longo prazo por contato (`contact_memories`) + flow classifier de feedback (`classify-agent-feedback`).
- Regras de segurança conversacional: sem botões numerados no texto, apenas templates nativos.
- Regras anti-alucinação para pagamento PIX/link.
- Rerank Voyage top 30 → top 5 no pipeline RAG.
- Visibilidade UI depende do provider ativo.
- Tools disponíveis: `create_task`, `schedule_follow_up` (via cron), `mark_name_asked` (confirmação de nome), escrita em `contact_memories`.
- Retry exponencial em falhas de provider.
- Melhoria persuasiva de texto (`ai-generate`).

## Edge functions
- Principal: `ai-agent-respond` (2372 LOC — 🔴 candidato a decomposição, ver dívida técnica).
- Ad-hoc: `ai-generate` (374 LOC).
- Suporte: `classify-agent-feedback`, `analyze-message`, `transcribe-audio`, `scheduled-messages-cron`.

## Providers / BYOK
Ver `integrations/byok/` e `integrations/lovable-ai-gateway/`. Override por org via `organization_integrations` e `intelligence_settings`.
