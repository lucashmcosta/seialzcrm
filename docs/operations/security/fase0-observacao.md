# Fase 0 — Janela de observação (EDGE_AUTH em modo log)

**Início:** 2026-07-05 06:15 UTC (deploy CLI das 5 functions: send v310, meta-send v56, agent v311, voice-webhook v320, enrich v15).
**Duração:** 48h → gate em **2026-07-07 06:15 UTC**.
**Modo:** `EDGE_AUTH_ENFORCE` não setado = `log`. **Nada é rejeitado** nesta janela.
**Onde olhar:** Dashboard Supabase → Edge Functions → *(função)* → Logs, buscar `AUTH-OBSERVE`. Plano completo: [`../proposals/2026-07-05-edge-auth-hardening.md`](../proposals/2026-07-05-edge-auth-hardening.md) · Checklist de deploy: [`../proposals/2026-07-05-fase0-deploy-checklist.md`](../proposals/2026-07-05-fase0-deploy-checklist.md).

## T+6h (~2026-07-05 12:15 UTC) — enrich v15 no cron real

- [ ] Logs da `marketing-campaign-enrich` no ciclo de 12:00 UTC: padrão normal (`Enriching N` / `Nothing to enrich`), sem erro novo.
- [ ] `last_synced_at` avançou (query read-only):
  ```sql
  SELECT sync_status, count(*), max(last_synced_at)
  FROM marketing_campaigns WHERE platform='meta' AND deleted_at IS NULL GROUP BY 1;
  ```
- [ ] Distribuição ≈ baseline (**70 success / 2 failed**, capturado 05:30 UTC).
- [ ] Sem alertas novos de token em `admin_notifications`.

## T+12h (~2026-07-05 18:15 UTC) — primeira varredura de observação

- [ ] Logs das 4 functions (send, meta-send, agent, voice-webhook), buscar `AUTH-OBSERVE` e classificar cada ocorrência:
  - `missing_bearer` → candidato Railway/integração externa (identificar por user-agent/IP);
  - `invalid_user_jwt` → anon key ou token expirado (integração a migrar);
  - `no_active_membership` → JWT de fora da org — investigar como possível abuso;
  - `auth_check_error` → bug do validador — agir imediatamente;
  - `missing_signature` / `no_auth_token_resolved` / `no_candidate_matched` (twilio-webhook) → assinatura Twilio.
- [ ] Descontar os 2 eventos sintéticos dos smoke tests de 06:16 UTC (`invalid_user_jwt` no send; `missing_signature` no voice-webhook).
- [ ] 4xx/5xx fora do padrão pré-existente (400s do `meta-capi-send-event` são baseline).
- [ ] Envio WhatsApp real validado pela equipe (1 comercial `/messages`, 1 atendimento `/inbox`; **não usar o 7020**).

## T+24h (~2026-07-06 06:15 UTC) — consolidação

- [ ] Consolidar todos os `AUTH-OBSERVE` por função × reason × caller (user-agent/IP).
- [ ] Lista de chamadores desconhecidos → para cada um: identificar dono, decidir credenciamento.
- [ ] Confirmar 2º e 3º ciclos da enrich normais.

## T+48h (2026-07-07 06:15 UTC) — recomendação final

Emitir uma das três:

- [ ] **Migrar para `enforce`** — se zero would-deny inexplicado e assinatura Twilio batendo (`matched != none`) nos eventos reais;
- [ ] **Corrigir integrações antes do enforce** — se apareceu chamador legítimo sem credencial (ex.: Railway); credenciar primeiro, repetir mini-janela;
- [ ] **Continuar em `log`** — se os dados foram inconclusivos (ex.: pouco tráfego de voz para validar assinatura).

A ativação de `enforce` é decisão explícita do founder — via secret `EDGE_AUTH_ENFORCE=enforce`, sem redeploy. Rollback: `off` (imediato).

## Registro

| Quando (UTC) | Check | Resultado |
|---|---|---|
| 2026-07-05 06:16 | Smoke pós-deploy (5 funções) | ✅ tudo conforme esperado; 2 AUTH-OBSERVE sintéticos gerados de propósito |
| | T+6h | |
| | T+12h | |
| | T+24h | |
| | T+48h — recomendação | |
