# ai-agent-respond

Path: `supabase/functions/ai-agent-respond/index.ts` (**2372 LOC — maior arquivo do repo**)

## Gatilho
- Chamada por `meta-whatsapp-webhook` e `twilio-whatsapp-webhook` após ingest de mensagem inbound.
- Também chamável diretamente por outros pontos (RPC/frontend admin). [INCERTO]

## Imports de `_shared/`
- `dispatch-whatsapp-send.ts` (envio da resposta gerada)

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY` (Lovable AI Gateway)
- `VOYAGE_API_KEY` (reranker + [INCERTO] embeddings)

## Tabelas — LEITURA
- `ai_agents`, `ai_agent_logs`, `contacts`, `contact_memories` (múltiplas), `pipeline_stages`, `opportunities`, `messages`, `message_threads`, `tasks`, `organization_integrations`, `integrations`, `products`, `knowledge_items`, `knowledge_chunks`, `scheduled_messages`

## Tabelas — ESCRITA
- `ai_agent_logs` (insert — múltiplos pontos: request, response, tool calls)
- `ai_usage_logs` (insert — telemetria de custo)
- `contact_memories` (insert/update — memória de longo prazo)
- `contacts` (update — nome confirmado, etc)
- `opportunities` (update)
- `tasks` (insert — tool `create_task`)
- `scheduled_messages` (insert — tool `schedule_follow_up`)
- `message_threads` (update)

## RPC
- `search_knowledge_global`, `search_knowledge_all`, `search_knowledge_product` (RAG)

## APIs externas
- `https://api.anthropic.com/v1/messages` (Claude — múltiplos pontos)
- `https://api.openai.com/v1/chat/completions` (OpenAI fallback / provedores alternativos)
- Voyage AI (reranker) — [INCERTO] URL exata dentro do arquivo
- Lovable AI Gateway ([INCERTO] fallback via `LOVABLE_API_KEY`)

## Observações
- **Function crítica e monolítica** (2372 LOC): concentra classificação de intenção, retrieval RAG, reranking, montagem de prompt, chamada multi-provider, execução de tools (create_task, schedule_follow_up, mark_name_asked, memory writes), sanitização e envio.
- Alto risco de erro por mudança pontual. Forte candidato a decomposição em módulos `_shared/ai/*`.
- Retorna a resposta ao WhatsApp via `dispatchWhatsAppSend`.
