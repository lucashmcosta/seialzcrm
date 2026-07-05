# Terminologia

Vocabulário do produto conforme aparece em código, tabelas e UI.

| Termo | Definição | Onde vive |
|---|---|---|
| Organização | Tenant do CRM | tabela `organizations` |
| Usuário | Membro de uma organização | `users` (linked a `auth.users`) |
| Vínculo | Relação usuário↔organização com role/perfil | `user_organizations` |
| Perfil de permissão | Conjunto de permissões atribuível ao vínculo | `permission_profiles` |
| Admin de plataforma | Operador Seialz, auth separada com MFA | `admin_users` |
| Impersonação | Admin operando como uma organização | `impersonation_sessions` + `admin_audit_logs` |
| Contato | Pessoa física/lead | `contacts` |
| Empresa | Pessoa jurídica associada a contatos | `companies` |
| Oportunidade | Deal em pipeline | `opportunities` + `pipeline_stages` |
| Etapa | Estágio de um pipeline | `pipeline_stages` |
| Tarefa | To-do vinculada a contato/oportunidade | `tasks` |
| Atividade | Registro histórico (log) | `activities` |
| Thread | Conversa WhatsApp/canal | `message_threads` |
| Mensagem | Item de uma thread | `messages` |
| Endpoint de comunicação | Número/canal remetente da org | `communication_endpoints` |
| Snippet | Texto reutilizável em chat | `message_snippets` |
| Template WhatsApp | Template oficial aprovado | `whatsapp_templates` + `whatsapp_template_actions` |
| Nota interna | Comentário fora do canal do cliente | `activities` (tipo específico) |
| Documento | Arquivo vinculado (contrato etc.) | `document_types` + `document_submissions` |
| Agente IA | Assistente configurável por org | `ai_agents` + `ai_agent_versions` + `ai_agent_logs` |
| Base de conhecimento | Documentos indexados para RAG | `knowledge_items` + `knowledge_chunks` + `knowledge_embeddings` |
| Intelligence | Análises automáticas de conversas | `intelligence_jobs`, `intelligence_settings`, `message_analyses`, `seller_metrics_daily` |
| BYOK | Bring Your Own Key (provider IA) | `organization_integrations` + `intelligence_settings` |
| Inbox v2 | Nova interface unificada de conversas | rota `/inbox`, hooks em `src/hooks/inbox/` |
| CAPI | Meta Conversions API | `capi_event_log`, integração `meta-capi` |
| CTWA | Click-to-WhatsApp (Meta Ads) | memory `integrations/whatsapp-ctwa-referral-capture` |
