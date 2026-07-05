# Auditoria CTWA — janela 72h vs 24h

Escopo: endpoint `407ff93d-4860-49cd-82ae-beda456c1774` (Central Trabalhista, +55 11 5028-7020), últimos 30 dias.
Sem alterações no banco ou no código. Apenas diagnóstico + plano.

---

## 1) Payload Meta — o que já é capturado

Arquivo: `supabase/functions/meta-whatsapp-webhook/index.ts`

- Faz parse de `messages[].referral` (linhas ~695–710) e considera `hasReferral` quando qualquer um destes existe: `source_url`, `source_id`, `ctwa_clid`, `headline`, `body`.
- Campos lidos do payload Meta:
  - `source_url` ✅
  - `source_id` ✅ (é o `ad_id`)
  - `source_type` ✅ (normalmente `"ad"`)
  - `headline` ✅
  - `body` ✅
  - `media_url` ✅
  - `ctwa_clid` ✅
- Campos **não** fornecidos pelo payload de referral do WhatsApp Cloud API (Meta não envia no webhook):
  - `ad_id` explícito → equivale a `source_id`.
  - `adset_id` ❌
  - `campaign_id` ❌
  - Estes só são obtidos via Marketing API (`/act_<id>/insights` ou `/{ad-id}?fields=adset_id,campaign_id`).

## 2) Onde é persistido hoje

| Local | Campos | Status |
|---|---|---|
| `contacts` | `ad_referral_source_url`, `ad_referral_source_id`, `ad_referral_source_type`, `ad_referral_headline`, `ad_referral_body`, `ad_referral_media_url`, `ad_referral_ctwa_clid`, `ad_referral_captured_at`, `source='ctwa'`, `utm_source='meta_ads'`, `utm_medium='ctwa'` | ✅ persistido |
| `messages.metadata` | `meta_cloud.raw` (payload cru) e `meta_cloud.referral` (objeto normalizado) | ✅ persistido por mensagem |
| `integration_inbound_events` | payload bruto do webhook | ✅ persistido |
| `message_threads` | **nada** relacionado a CTWA/origem/janela | ❌ **gap** — não há `origin_type`, `ctwa_expires_at`, `service_window_expires_at`, nem `last_customer_message_at` dedicado (só `last_inbound_at` / `whatsapp_last_inbound_at`) |
| `opportunities` | nada específico de CTWA (herda do contato) | ⚠️ ok via join |
| utm/tracking tables | não existem tabelas dedicadas; UTM vive em `contacts` | ⚠️ suficiente para atribuição básica |

## 3) Histórico — endpoint 7020, últimos 30 dias

Threads WhatsApp no endpoint: **665**
Threads cujo contato tem referral CTWA capturado: **616 (92,6%)**
Contatos distintos com CTWA capturado na org (30d): **3.120**

Templates outbound (30d) no endpoint: **415**
- Enviados para contatos com CTWA: **391 (94,2%)**
- Enviados **dentro de 72h após o clique CTWA** (ad_referral_captured_at + 72h): **351 (84,6%)** — a grande maioria dos templates está tecnicamente dentro da janela de 72h.
- Enviados **entre 25h e 72h após o primeiro inbound** do cliente (poderiam ser freeform se aplicássemos regra 72h em vez de 24h): **53** templates.

Conclusão dura: hoje tratamos tudo como janela 24h. Isso significa que **~85% dos disparos de template do 7020 aconteceram em contatos que estavam legalmente dentro dos 72h de CTWA** — grande parte poderia ter sido freeform, sem consumir cota de template e sem contribuir para o LOW.

## 4) Regra de janela proposta

```
janela_ativa = MAX(
  last_inbound_at + 24h,           -- janela orgânica padrão
  first_ctwa_at + 72h              -- janela CTWA (só se origin_type='ctwa')
)
```

- **Inbound orgânico** → `service_window_expires_at = last_inbound_at + 24h`.
- **CTWA / referral** → `service_window_expires_at = MAX(last_inbound_at + 24h, ctwa_captured_at + 72h)`.
- **Cliente responder de novo** → renova em `last_inbound_at + 24h` (nunca diminui a janela que já era mais longa).
- **Dentro da janela** → freeform permitido, template opcional.
- **Fora da janela** → apenas template elegível (regras do bloco 7).
- Regra fica **por thread**, não por contato: novas conversas de um mesmo contato reiniciam a contagem baseada no que aconteceu naquele thread.

## 5) Schema proposto (a implementar depois — nada aplicado agora)

`message_threads`:
- `origin_type text` — `organic | ctwa | import | manual` (default `organic`).
- `origin_ref_id text` — `source_id` do ad quando `ctwa`.
- `first_ctwa_at timestamptz` — primeiro inbound com `referral` no thread.
- `last_ctwa_at timestamptz` — último inbound com `referral` (para múltiplos cliques).
- `last_customer_message_at timestamptz` — espelha `last_inbound_at` mas semanticamente dedicado a janela (útil para separar de sistema).
- `service_window_expires_at timestamptz` — coluna calculada por trigger (MAX regra acima).
- Índice parcial: `(organization_id, service_window_expires_at) WHERE service_window_expires_at > now()`.

`messages`:
- `referral_metadata jsonb` — normalização estável (hoje está em `metadata.meta_cloud.referral`, ok manter).
- Backfill leve: apenas popular `origin_type`/`first_ctwa_at` nas threads existentes a partir de `contacts.ad_referral_captured_at` + primeiro inbound.

Trigger: em cada `INSERT` de `messages` inbound com `metadata->meta_cloud->referral` não nulo, atualizar `origin_type='ctwa'`, `first_ctwa_at = COALESCE(first_ctwa_at, sent_at)`, `last_ctwa_at = sent_at`, e recomputar `service_window_expires_at`.

## 6) UI — composer

Estados visuais (chip único, substitui o `WhatsAppWindowChip` atual):

| Estado | Copy | Cor |
|---|---|---|
| freeform livre, CTWA ativo | `CTWA 72h · expira em Xh` | emerald |
| freeform livre, orgânico | `Sessão 24h · expira em Xh` | emerald |
| freeform livre, <2h para expirar | mesmo texto | amber |
| fora da janela | `Fora da janela · só template` | destructive |
| sem inbound | `Sem inbound · só template` | muted |

Fonte única: `message_threads.service_window_expires_at` + `origin_type`. Frontend não recalcula regra, só formata.

## 7) Compliance — bloqueios propostos

- Se `service_window_expires_at > now()` → **desbloquear freeform**, esconder seletor de template por padrão (permitir via "..." como fallback).
- Se janela fechada → apenas templates elegíveis (respeitando as regras da auditoria do 7020: `tentativa_de_contato` pausado, `primeiro_contato` só UTILITY, cooldown 30d).
- Regra dura: **nunca enviar template MARKETING se `service_window_expires_at > now()`** — sempre freeform. Isso sozinho corta ~53 disparos/30d no 7020 imediatamente e a maior parte dos ~351 disparos "dentro da CTWA" fica opcional.
- Log de auditoria: registrar em `messages.metadata` o `window_state` no momento do envio (`ctwa_open | organic_open | closed`) para auditar violações depois.

---

## Resumo executivo

- **Captura de CTWA já funciona** no webhook e no `contacts`. O gap está em **propagar essa origem para o thread** e em **calcular a janela correta** (24h vs 72h).
- Sem a janela de 72h, o 7020 tratou como "fora da janela" contatos que ainda estavam elegíveis a freeform, o que **empurrou volume desnecessário para templates de MARKETING** — um dos vetores diretos do LOW.
- Nenhuma implementação foi feita. Próximo passo: aprovar o schema do item 5 e o comportamento do composer do item 6 antes de migrar.

Queries usadas: ver histórico da auditoria (todas em `messages` + `message_threads` + `contacts` filtradas por `primary_endpoint_id='407ff93d-...'`).
