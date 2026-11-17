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
- Ferramenta `calculate_labor_case` (calculadora da rescisão): só aparece se o agente a tiver ligada e a org tiver o widget Central Trabalhista (`overtime_calculator`) ligado. Usa o mesmo motor do widget (`_shared/labor-calc/agent.ts`): diz ao agente o que falta perguntar ou manda ao cliente, depois do texto, a mesma mensagem da rescisão que a equipe copia no widget, e grava o resumo do caso como nota interna. Não manda com prazo de 2 anos vencido, nem duas vezes o mesmo cálculo.
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

## Providers / BYOK
Ver `integrations/byok/` e `integrations/lovable-ai-gateway/`. Override por org via `organization_integrations` e `intelligence_settings`.
