# Fluxos de evento

## 1. Mensagem WhatsApp inbound (Meta Cloud)

```
Meta Cloud
  → POST supabase/functions/meta-whatsapp-webhook
    → resolve org via waba_id → communication_endpoints
    → grava em messages / message_threads (caminho legado)
      OU enfileira em integration_inbound_events (caminho novo)
    → dispara ai-agent-respond (se AI ativa)
      → busca RAG (search_knowledge_*), rerank Voyage, Claude/OpenAI/Gemini
      → executa tools (create_task, schedule_follow_up, escrita em contact_memories)
      → dispatch-whatsapp-send.ts → meta-whatsapp-send
Realtime Supabase → Frontend (useInboxThreads, useMessageThreads)
```

## 2. Mensagem WhatsApp inbound (Twilio)

Análogo, porém `twilio-whatsapp-webhook` → resolve org via `messaging_service_sid` antes de qualquer gravação (cross-org routing).

## 3. Envio outbound WhatsApp

```
Frontend → dispatchWhatsAppSend (src/lib/dispatchWhatsAppSend.ts)
  → escolhe provider/endpoint ativo (prefere sender online; regras de re-rota em product/channel-boundaries.md)
    → meta-whatsapp-send  OU  twilio-whatsapp-send
      → Meta Graph / Twilio API
      → registra em messages (status pending → sent → delivered)
```

Templates: caminho separado (`meta-whatsapp-templates-*` / `twilio-whatsapp-templates`).

## 4. Lead Ads (Meta)

```
pg_cron */3min → meta-lead-ads-poll
  → Meta Graph (leadgen forms) → meta-lead-ads-process-lead
    → dedupe (descarta leads já processados)
    → cria contact + opportunity
    → registra atribuição (marketing_attribution_*)
```

## 5. Conversion API (CAPI)

```
Frontend evento de conversão
  → meta-capi-send-event
    → hash SHA-256 PII
    → Meta Graph POST /events
    → capi_event_log (audit + retry)

pg_cron → meta-capi-retry-cron → retry itens com erro
```

## 6. Voz outbound (Twilio WebRTC)

```
Frontend (@twilio/voice-sdk) → twilio-token (JWT WebRTC)
  → conexão direta ao Twilio
  → twilio-webhook recebe eventos de status
  → grava em calls + call_recordings
OutboundCallProvider desativa em /admin/*
```

## 7. Import Kommo

```
UI Kommo Wizard
  → kommo-validate → kommo-fetch-pipelines → kommo-preview
  → kommo-migrate (575 LOC — paginação Kommo)
    → RPC rpc_kommo_upsert_contact / rpc_kommo_upsert_opportunity
    → registra em import_logs (auditoria/rollback)
  → kommo-rollback reverte via import_logs
```

## 8. Intelligence (análise de conversas)

```
pg_cron:
  * intelligence-backfill-tick */2min → trigger_intelligence_backfill
  * intelligence-worker-30s → consome intelligence_jobs (via rpc_claim_intelligence_jobs)
    → despacha para analyze-message (ou outros handlers)
      → message_analyses, seller_metrics_daily
  * intelligence-ghosting-hourly, intelligence-rollup-daily, intelligence-retention-daily
```

## 9. Integrações outbound genéricas

```
Trigger DB / código → insert em integration_jobs
  → pg_cron every 30s → integration-worker (auth x-worker-token)
    → resolveHandler(registry) → executa (Kommo mirror, etc)
    → grava integration_audit_logs, external_mappings
    → agenda retry via fn_schedule_retry
```

## 10. RAG / Knowledge Base

```
Upload/URL/edit → import-knowledge / import-from-url
  → knowledge_items + chunks (process-knowledge*)
    → generate-embedding (Voyage) → knowledge_embeddings
Query em ai-agent-respond:
  → search_knowledge_global/all/product
  → rerank Voyage top 30 → top 5
```

Ver `docs/audit/02-edge-functions/` para as 90 fichas detalhadas.
