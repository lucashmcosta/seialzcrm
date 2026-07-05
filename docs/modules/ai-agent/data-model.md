# Modelo de dados — Agente IA

| Tabela | Papel |
|---|---|
| `ai_agents` | 30 col — configuração por org |
| `ai_agent_versions` | 16 col — versionamento |
| `ai_agent_logs` | 14 col — histórico de requests/respostas/tools |
| `ai_interaction_logs` | 31 col — telemetria detalhada |
| `ai_usage_logs` | 16 col — custo/tokens |
| `agent_pending_questions` | 10 col — perguntas em espera |
| `contact_memories` | 15 col — memória de longo prazo por contato |
| `intelligence_settings` | 9 col — config de provider por org |
| `intelligence_settings_audit` | 6 col — audit |
| `organization_integrations` | Credenciais BYOK |

Grants padrão `authenticated` + `service_role`. Sem `anon`.
