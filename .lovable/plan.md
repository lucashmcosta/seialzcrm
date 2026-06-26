# Auditoria WhatsApp Seialz — Read-Only

Objetivo: descobrir **exatamente** onde o envio quebra hoje, sem mexer em nada. Ao final entrego um relatório com causa raiz + plano de correção para você aprovar antes de qualquer mudança.

## Contexto já conhecido
- O envio outbound do CRM passa por: **Frontend → Railway (`seialz-backend-production`) → Twilio Content API → Meta WhatsApp**.
- Webhooks inbound/status passam por edge functions Supabase (`twilio-whatsapp-webhook`).
- Já confirmado nas últimas auditorias: 502/503 em `analyze-message` e `transcribe-audio` são **OpenAI 429**, não relacionados a envio.
- Última mensagem registrada: 26/06 17:46 — então **algo está saindo**, precisamos confirmar se é só inbound ou também outbound.

## Etapas da auditoria (todas read-only)

### 1. Confirmar o escopo real da falha (DB)
Rodar em `supabase--read_query`:
- Últimos envios outbound por status nas últimas 24h / 7d (`messages` filtrando `direction='outbound'`, agrupado por `status`).
- Última mensagem outbound com `status='sent'` / `delivered` vs. `failed` / `queued` / `pending`.
- Distribuição por `endpoint_id` / org para ver se é global ou de uma org só.
- Mensagens criadas com `external_id IS NULL` (nunca chegaram na Twilio).
- `scheduled_messages` presas (`status != 'sent'`, `scheduled_at < now()`).

### 2. Estado das integrações WhatsApp por org
- `organization_integrations` join `admin_integrations` onde slug = `twilio-whatsapp`: `is_enabled`, `webhooks_configured`, `setup_completed_at`, `whatsapp_from`, `messaging_service_sid`.
- `communication_endpoints` ativos por org: `status`, `last_seen_at`, `provider_phone_id`.
- `whatsapp_templates` recentes: contagem por `status` (approved / pending / rejected) e templates marcados como `is_active`.

### 3. Logs Twilio/Railway-side (Supabase analytics)
- `integration_inbound_events` últimos 7d: status webhooks (`sent`, `delivered`, `failed`, `undelivered`), `ErrorCode` predominantes.
- `integration_inbound_ingest_errors` últimas 24h.
- `integration_jobs` + `integration_audit_logs` últimas 24h: jobs em `dead_letter` / `failed` / presos em `running`.
- `capi_event_log` por completude (sanity check Meta).

### 4. Edge functions relacionadas (logs Supabase)
- `twilio-whatsapp-webhook` — erros, latência, status responses.
- `twilio-whatsapp-send` (se ainda em uso) — boot + invocações + erros.
- `integration-worker` — sumário de classifications no último ciclo.
- `analytics_query` em `function_edge_logs` filtrando 4xx/5xx das últimas 24h só dessas funções.

### 5. Frontend / serviço Railway
- Confirmar que `src/services/whatsapp.ts` ainda aponta para `https://seialz-backend-production.up.railway.app/api/whatsapp` e que esse host está respondendo (curl read-only de `/health` se existir, sem credenciais).
- Verificar se há erros recentes nos console logs do preview relativos a `whatsapp/send` (já temos snapshot disponível).

### 6. Secrets (apenas listar nomes, nunca valores)
- `fetch_secrets` para confirmar presença de: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `META_*` (se aplicável), `INTEGRATION_WORKER_TOKEN`, `RAILWAY_*`.
- Não há como validar expiração de token Meta pelo Supabase; sinalizar onde checar no painel Twilio/Meta.

### 7. Janela 24h e templates
- Para uma amostra de 5 threads recentes com tentativa de envio falha: checar `last_inbound_at` vs. tentativa, e se o envio era texto livre fora da janela (deveria ter virado template).
- Listar últimos templates rejeitados pela Meta (`whatsapp_templates.rejection_reason`).

### 8. Rate limit e padrões de erro
- Agrupar erros por código nos webhooks status (Twilio ErrorCode 63016, 63018, 21610, 429 etc.) para mapear causa raiz mais provável.

## Entregável final (após rodar as 8 etapas)

Relatório em chat com:
1. **Onde quebra** (frontend, Railway, Twilio, Meta, ou múltiplos pontos) com evidência (contagens + IDs de exemplo).
2. **Causa raiz mais provável** + códigos de erro observados.
3. **Logs/queries relevantes** copiados.
4. **Plano de correção** priorizado (curto prazo: destravar envio; médio prazo: melhorar observabilidade — surfaces de erro "token expirado / template não aprovado / fora da janela 24h" no UI).
5. **Como prevenir recorrência** (alertas, dashboard de saúde de envio, retry/backoff).

## Garantias
- Nenhum `INSERT` / `UPDATE` / `DELETE`, nenhuma migration, nenhum deploy de edge function, nenhum secret alterado.
- Só `read_query`, `analytics_query`, `edge_function_logs`, `fetch_secrets` (lista de nomes) e leitura de arquivos do repo.
- Qualquer mudança (mesmo adicionar logging) só depois de você aprovar o plano de correção no fim do relatório.

Quer que eu prossiga com essa auditoria?