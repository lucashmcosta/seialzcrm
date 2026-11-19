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
- Ferramentas de widget (`_shared/widgets/agent-tools.ts`): o agente não conhece nenhum widget. Ele usa as ferramentas da lista que estiverem ligadas no agente e cujo widget estiver ligado na org (`organization_widgets`). Cada uma traz a própria instrução para o prompt, pode mandar uma mensagem pronta ao cliente depois do texto, gravar uma nota para a equipe e ler anexos do cliente. No assistente do agente, aparecem por `agentTools` em `src/widgets/registry.ts`. Cada ferramenta pode também mandar imagem ou documento por URL pública (`clientMedia`), que sai depois dos textos com a legenda como conteúdo da mensagem, e recebe a própria configuração de `ai_agents.tool_settings[nome da ferramenta]`. Hoje: `calculate_labor_case`, do widget Central Trabalhista, e as quatro do widget Plamev (`plamev_consultar_rede`, `plamev_simular_plano`, `plamev_ler_materiais`, `plamev_enviar_material`); ver `docs/modules/widgets/README.md`.
- Texto em Markdown do modelo (`**negrito**`, `[nome](#)`, títulos) vira o formato do WhatsApp antes de enviar (`toWhatsAppText`).
- Áudio entra pela transcrição. Foto, documento, vídeo e figurinha o agente não vê: ele recebe um aviso do tipo de anexo, também no histórico, sem o nome do arquivo de documento (costuma ter CPF), e a regra de não dizer que conferiu nem perguntar o que é cada arquivo. Outros tipos passam para uma pessoa.
- Agente de atendimento (`agent_type = 'support'`): atende as conversas da tela de atendimento (`business_context = 'customer_service'`), de clientes que já têm responsável. Os webhooks escolhem o agente pelo contexto da conversa (`agentTypeForThread`); vendas continua com o agente `sdr`. Fica quieto se uma pessoa da equipe respondeu nas últimas 2 h; depois de passar a conversa para a equipe, espera alguém responder e volta a atender se ninguém responder em 24 h (`decideSupportGate`). O responsável da conversa não muda. Com a integração Nammux, o prompt recebe os processos do cliente (etapa, situação, número, responsável) de `nammux_process_snapshots` (`_shared/integrations/nammux-process-context.ts`).
- Agente que se apresenta pelo nome (`presents_as_assistant = false`): quando perguntam se é pessoa ou IA, o padrão é dizer a verdade e oferecer uma pessoa. Com `compliance_rules.ai_question = "handoff"` (e `transfer_to_human` ligado), ele não responde a pergunta e passa a conversa para a equipe. Em nenhum caso afirma ser uma pessoa (`agentIdentityLine`, `aiQuestionMode`).
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
- Teste com conversas antigas: `agent-backtest` (só admin da org). Repassa conversas reais ao agente em modo de teste (nada vai ao cliente), com a chave de IA da org, e grava o resultado em `agent_backtest_runs`. Ações `dry_run` (conta e estima o custo, sem gastar), `run` (em segundo plano; recusa se o custo estimado passar de `budget_usd`) e `status`. Cenário `labor_calc` (do widget Central Trabalhista, em `_shared/widgets/labor-center/backtest.ts`): conversas em que a equipe mandou o cálculo da rescisão do widget; compara o total que o agente mandaria com o da equipe. Os anexos passam pelos mesmos leitores de widget do agente. Cenário `support` (`scenario: 'support'`): conversas recentes da tela de atendimento; mostra a resposta do agente ao lado da última resposta da equipe e se ele passaria para uma pessoa. Regras genéricas em `_shared/intelligence/agent-backtest.ts`, testes em `tests/agent-backtest.test.ts`.

## Providers / BYOK
Ver `integrations/byok/` e `integrations/lovable-ai-gateway/`. Override por org via `organization_integrations` e `intelligence_settings`.
