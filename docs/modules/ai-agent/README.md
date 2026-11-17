# Módulo: Agente IA

Configurável em `/settings/ai-agent` e `/settings/ai-providers`.

## Comportamento
- Wizard behavioral em 5 passos + RAG estrito (versões em `ai_agent_versions`).
- Multi-model: Claude, OpenAI, Gemini — uniqueness por org.
- Suporte a modelos de raciocínio + recuperação de resposta vazia.
- Limite de mensagens por agente por thread via `ai_agent_logs`.
- Lê as últimas 80 mensagens da conversa (`HISTORY_LIMIT`). Antes de responder, espera 10 s (`BURST_WAIT_MS`) e só a chamada da última mensagem do cliente responde, já lendo todas.
- Na Meta Cloud API, mostra "digitando..." enquanto espera e monta a resposta (`_shared/meta-whatsapp/typing.ts`). O mesmo pedido marca a mensagem do cliente como lida. Nos outros provedores não faz nada.
- Mensagem do cliente que chegou enquanto a resposta anterior era enviada (as duas se cruzaram) vai para o fim do histórico, com uma instrução interna para não repetir a resposta nem refazer a pergunta (`placeCurrentMessage`).
- Ferramentas de widget (`_shared/widgets/agent-tools.ts`): o agente não conhece nenhum widget. Ele usa as ferramentas da lista que estiverem ligadas no agente e cujo widget estiver ligado na org (`organization_widgets`). Cada uma traz a própria instrução para o prompt, pode mandar uma mensagem pronta ao cliente depois do texto, gravar uma nota para a equipe e ler anexos do cliente. No assistente do agente, aparecem por `agentTools` em `src/widgets/registry.ts`. A única hoje é `calculate_labor_case`, do widget Central Trabalhista (ver `docs/modules/widgets/README.md`).
- Texto em Markdown do modelo (`**negrito**`, `[nome](#)`, títulos) vira o formato do WhatsApp antes de enviar (`toWhatsAppText`).
- Áudio entra pela transcrição. Foto, documento, vídeo e figurinha o agente não vê: ele recebe um aviso do tipo de anexo, também no histórico, sem o nome do arquivo de documento (costuma ter CPF), e a regra de não dizer que conferiu nem perguntar o que é cada arquivo. Outros tipos passam para uma pessoa.
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
- Teste com conversas antigas: `agent-backtest` (só admin da org). Repassa conversas reais ao agente em modo de teste (nada vai ao cliente), com a chave de IA da org, e grava o resultado em `agent_backtest_runs`. Ações `dry_run` (conta e estima o custo, sem gastar), `run` (em segundo plano; recusa se o custo estimado passar de `budget_usd`) e `status`. Cenário `labor_calc` (do widget Central Trabalhista, em `_shared/widgets/labor-center/backtest.ts`): conversas em que a equipe mandou o cálculo da rescisão do widget; compara o total que o agente mandaria com o da equipe. Os anexos passam pelos mesmos leitores de widget do agente. Regras genéricas em `_shared/intelligence/agent-backtest.ts`, testes em `tests/agent-backtest.test.ts`.

## Providers / BYOK
Ver `integrations/byok/` e `integrations/lovable-ai-gateway/`. Override por org via `organization_integrations` e `intelligence_settings`.
