
# Seialz Intelligence — Plano MVP final (simplificado)

## Objetivo
Capturar **rapidamente** os dados certos para responder:
- Won vs Lost — o que fecha faz diferente?
- Top sellers vs Low performers — quem converte faz o quê?
- Áudio vs Texto, response time, follow-up, ghosting, lost prematuro.

Frase-guia exibida na tela:
*"Descobrir padrões reais de fechamento, evitar leads perdidos cedo demais e treinar agentes de IA com base nos melhores vendedores."*

MVP **não entrega dashboard** — entrega a tubulação de dados + 5 telas de settings simples. "Padrões de Fechamento" fica como placeholder ("Em breve") com contagens brutas para confirmar coleta.

---

## Fase 1 — Schema (uma migration)

### 1.1 `intelligence_settings` (1:1 por organização)
JSONB por seção, defaults ON para maximizar coleta:

```text
capture     — { whatsapp: true, inbound: true, outbound: true,
                only_open_deals: true, ignore_internal_notes: true }
transcription — { mode: "all_whatsapp", include_lead_audio: true,
                  include_seller_audio: true, max_audio_seconds: 600 }
behavior    — { detect_objection: true, detect_buying_signal: true,
                detect_ghosting: true, detect_premature_lost: true,
                min_cadence_before_lost: { messages: 3, days: 5 },
                ghosting_threshold_days: 4 }
privacy     — { transcription_retention_days: 180, org_opt_out: false }
```

V2 (não-MVP): `routing` (modelos por função), `limits` (orçamento), `privacy.anonymize`, `next_best_action`.

Seed: insere linha default para toda org existente; trigger insere para novas orgs.

### 1.2 Expandir `sales_events` (mantém event sourcing único)
Sem nova tabela. Apenas:
- Adiciona novos `event_type` aceitos: `price_question`, `deadline_question`, `objection`, `buying_signal`, `ghosting`, `premature_lost`, `follow_up`, `no_reply`, `document_sent`, `audio_sent`, `audio_received`.
- Garante colunas/índices úteis no `sales_events` atual:
  - `payload jsonb` (já existe).
  - Índices novos: `(organization_id, event_type, occurred_at desc)`, `(opportunity_id, event_type)`, `(user_id, occurred_at desc)`.
- Sem mudar policies (mantém RLS atual).

### 1.3 `message_response_times` (única tabela operacional nova)
Necessária porque calcular response time em runtime via janelas é caro.
```text
id, organization_id, thread_id, opportunity_id, user_id, contact_id,
inbound_message_id, outbound_message_id,
inbound_at, outbound_at, response_seconds,
created_at
```
Populada por trigger: após insert outbound, busca último inbound não-respondido no thread → grava 1 linha.
Índices: `(organization_id, user_id, outbound_at)`, `(opportunity_id)`.

### 1.4 `opportunity_behavior_snapshot` (tabela "ouro" — 1 linha por opportunity)
Esta é a tabela que responde **won vs lost** com um SELECT.
```text
opportunity_id PK, organization_id, contact_id, user_id, final_status,
total_messages_inbound, total_messages_outbound,
audios_inbound, audios_outbound, documents_sent,
first_response_seconds,
avg_lead_response_seconds, avg_seller_response_seconds,
asked_price (bool), asked_deadline (bool), sent_documents (bool),
objections_count, buying_signals_count,
hours_distribution jsonb,
days_to_close int, days_to_ghost int,
ghosted_after_stage text, lost_reason, lost_at, won_at,
last_inbound_at, last_outbound_at, updated_at
```
Trigger em `opportunities` (status change) e em `messages` (incrementa contadores) → UPSERT.

### 1.5 `seller_metrics_daily` (agregado por cron diário)
```text
organization_id, user_id, day,
messages_sent, messages_received, audios_sent, audios_received,
avg_response_seconds, median_response_seconds,
follow_ups_count, leads_touched, leads_lost, leads_won,
avg_messages_per_lost, avg_days_before_lost,
hot_leads_abandoned
```

### 1.6 Auditoria mínima
`intelligence_settings_audit` — quem mudou, antes/depois, quando.

RLS: todas as novas tabelas com `organization_id = ANY(current_user_org_ids())`. Edge functions usam `jsr:@supabase/supabase-js@2`.

---

## Fase 2 — Edge functions

### Refatoradas
- `analyze-message` — lê `intelligence_settings.capture/behavior`; ao detectar `price_question`, `deadline_question`, `objection`, `buying_signal`, `premature_lost` grava em **`sales_events`** com `event_type` novo.
- `transcribe-audio` — respeita `transcription.mode` + flags lead/vendedor.
- `intelligence-worker` — antes de despachar, checa `capture.only_open_deals` e `org_opt_out`.

### Novas
- `intelligence-ghosting-detector` (cron horário) — para deals abertos sem inbound há `ghosting_threshold_days`, insere `sales_events.event_type = 'ghosting'`.
- `intelligence-rollup-cron` (cron diário) — popula `seller_metrics_daily` e recalcula `opportunity_behavior_snapshot` de deals fechados no dia.
- `intelligence-retention-cron` (cron diário) — purga transcrições além de `transcription_retention_days`.

### Helper compartilhado
`_shared/intelligence/settings.ts` — `getIntelligenceSettings(orgId)` com cache curto.

---

## Fase 3 — UI `/settings/intelligence` (5 abas, simples)

Rota nova no `SettingsLayout`. Permissão admin. Breadcrumbs, sem subtítulo. Tokens semânticos, Outfit, bordas 6px.

1. **Visão Geral**
   - Frase-guia em destaque.
   - Kill switch `org_opt_out`.
   - 4 cards de contagem 7d: mensagens analisadas, áudios transcritos, deals com snapshot, alertas de ghosting.
   - Card "Padrões de Fechamento — Em breve" com prévia: total won / lost / ghosted / premature_lost.

2. **Captura & Análise**
   - Toggles: WhatsApp, inbound, outbound, só deals abertos, ignorar notas internas.

3. **Transcrição**
   - Mode (radio): `all_whatsapp` (default) · `leads_only` · `agents_only` · `open_deals_only` · `off`.
   - Toggles include_lead_audio / include_seller_audio.
   - Slider `max_audio_seconds`.
   - Input `transcription_retention_days`.

4. **Regras Operacionais**
   - Toggles: detectar objeção, buying signal, ghosting, lost prematuro.
   - Cadência mínima antes de lost (mensagens + dias).
   - Threshold de ghosting (dias).

5. **Chaves (BYOK)**
   - Embute `AIProvidersSettings` atual sem mudanças.

V2 fica explícito como "Em breve" no rodapé: modelos por função, orçamento, anonimização, next best action, roteamento avançado.

---

## Fase 4 — Sanity check de coleta
Após deploy, validar:
- `select count(*), final_status from opportunity_behavior_snapshot group by 2;`
- `select event_type, count(*) from sales_events where occurred_at > now()-interval '1 day' group by 1;`
- `select user_id, avg(avg_response_seconds) from seller_metrics_daily where day > now()-interval '7 days' group by 1;`

Se todos retornarem dados → fundação pronta para a aba "Padrões de Fechamento" no V2.

---

## Fora do MVP (V2+)
- Dashboard analítico won vs lost / top vs low.
- Treino automático do agente com padrões.
- Modelos por função na UI.
- Orçamento, alertas de custo, anonimização PII, auditoria avançada.
- Multi-canal (Instagram, email).
- Sugestão automática de next best action escrita ao vendedor.
- Separar `conversation_events` de `sales_events` (só se volume exigir).
