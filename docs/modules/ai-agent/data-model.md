# Modelo de dados — Agente IA

| Tabela | Papel |
|---|---|
| `ai_agents` | 30 col — configuração por org |
| `ai_agent_versions` | 16 col — versionamento |
| `ai_agent_logs` | 14 col — histórico de requests/respostas/tools |
| `ai_interaction_logs` | 31 col — telemetria detalhada |
| `ai_usage_logs` | 16 col — custo/tokens |
| `agent_pending_questions` | 10 col — perguntas em espera |
| `agent_backtest_runs` | rodadas do teste com conversas antigas (`agent-backtest`): contagens, custo e cada caso em `cases`. Leitura pela org, escrita só pela função |
| `contact_memories` | 15 col — memória de longo prazo por contato |
| `intelligence_settings` | 9 col — config de provider por org |
| `intelligence_settings_audit` | 6 col — audit |
| `organization_integrations` | Credenciais BYOK |
| `message_threads.ai_agent_reply_claim_message_id` | última mensagem do cliente que já tem uma chamada do agente respondendo. Evita duas respostas para mensagens do mesmo segundo |
| `messages.metadata.agent_widget_result` | marca a nota interna do resultado de uma ferramenta de widget (ex.: cálculo). Se o cliente não responder às retomadas, 2 h depois da última o `agent-followups` passa a conversa para a equipe (`silent_after_widget_result`) |
| `scheduled_messages` (`created_by = 'agent'`) | um lembrete pendente do agente por conversa: um novo substitui o anterior |

Grants padrão `authenticated` + `service_role`. Sem `anon`.
