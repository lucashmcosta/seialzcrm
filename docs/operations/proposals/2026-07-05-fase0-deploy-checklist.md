# Checklist — deploy Fase 0 (observação) + marketing-campaign-enrich

Roteiro para o push dos 2 commits locais (`HOLD` + `security Fase 0`) e a janela de observação. Complementa [`2026-07-05-edge-auth-hardening.md`](2026-07-05-edge-auth-hardening.md). **Nenhum enforcement é ativado neste deploy** — default `EDGE_AUTH_ENFORCE=log`.

## O que o push publica/deploya

| Item | Efeito |
|---|---|
| `marketing-campaign-enrich` (novo no repo) | Pipeline deploya v15+ substituindo a ad-hoc v14 — **código idêntico** ao deployado (verificado export a export); única mudança real é a proveniência |
| `twilio-whatsapp-send` (v309→) / `meta-whatsapp-send` (v55→) / `ai-agent-respond` (v310→) / `twilio-webhook` (v319→) | Ganham bloco de observação — logam `[AUTH-OBSERVE]`, **não rejeitam nada** |
| `_shared/auth.ts` + `_shared/twilio-signature.ts` | Podem disparar redeploy de outras functions que embutem `_shared` — sem mudança de comportamento (só exports novos) |

Versões acima = as atuais em prod (referência de rollback).

## Pré-deploy (T−15min)

- [ ] Janela: horário comercial com alguém disponível para validar envio (não sexta à noite).
- [ ] Baseline enrich (capturado 2026-07-05 05:30 UTC): **70 `success` / 2 `failed`**. Recapturar se o deploy for em outro dia:
  ```sql
  SELECT sync_status, count(*), max(last_synced_at)
  FROM marketing_campaigns WHERE platform='meta' AND deleted_at IS NULL GROUP BY 1;
  ```
- [ ] Confirmar `git log --oneline origin/main..main` = exatamente os 2 commits esperados (+ este checklist).

## Deploy

- [ ] `git push origin main`
- [ ] CI verde na main (workflow `docs-validate`).
- [ ] Dashboard Supabase → Edge Functions: versões das 5 funções **incrementaram** e status ACTIVE (ou pedir ao agente `list_edge_functions`, read-only).

## Smoke test (T+0 a T+30min) — quem valida envio WhatsApp

Executor: **founder ou 1 operador de confiança por área** (1 do comercial, 1 do atendimento), enviando para um número interno de teste — **não usar o 7020** (Central Trabalhista, saúde crítica na Meta); preferir endpoint saudável (ex.: Viagi).

- [ ] `/messages` (comercial): enviar texto livre → entregue no aparelho; `messages.status` progride pending→sent→delivered.
- [ ] `/inbox` (atendimento): idem.
- [ ] Cobrir os 2 providers se possível (endpoint Twilio e endpoint Meta Cloud).
- [ ] Responder de volta (inbound) e confirmar que o **agente IA responde** numa thread com agente ativo.
- [ ] Se voz estiver em uso: 1 chamada de teste → evento de status gravado em `calls`.

## Janela de observação — onde, o quê, por quanto tempo

**Onde:** Dashboard Supabase → Edge Functions → *(cada uma das 4)* → **Logs**, buscando a string `AUTH-OBSERVE`. Alternativa: pedir ao agente para puxar via `get_logs` (read-only). ⚠️ Retenção de logs pode ser de ~24h dependendo do plano — **checar a cada ~12h**, não só no fim.

**Duração:** **48h úteis**, cobrindo: ≥8 ciclos do cron da enrich (6h), 1 dia comercial completo (tráfego real de /messages, /inbox, agente) e webhooks de voz.

**O que cada `would-deny` significa:**

| `reason` no log | Interpretação | Ação |
|---|---|---|
| *(nenhum log)* | Todos os chamadores já são válidos | Melhor cenário — libera Fase 2 |
| `missing_bearer` | Chamador sem credencial — **candidato: Railway** ou integração externa | Identificar por `user_agent`/`x_forwarded_for` e credenciar antes da Fase 2 |
| `invalid_user_jwt` | Anon key usada como bearer, ou token expirado | Se recorrente do mesmo caller: integração de cliente a migrar |
| `no_active_membership` | JWT válido de usuário **fora da org** | Investigar — potencial abuso real ou bug de front |
| `auth_check_error: …` | Erro no próprio validador | Bug nosso — investigar imediatamente |
| `twilio-webhook` + `missing_signature` | POST sem assinatura → **não veio do Twilio** | Provável scanner/abuso — evidência para enforce |
| `twilio-webhook` + `no_auth_token_resolved` | Lookup do Auth Token falhou (org/AccountSid) | Corrigir resolução antes da Fase 2 |
| `twilio-webhook` + `no_candidate_matched` | URL assinada ≠ URL reconstruída (proxy) | Setar `TWILIO_WEBHOOK_PUBLIC_BASE_URL` com a URL pública exata |

**Sinais de erro gerais (além do AUTH-OBSERVE):** spike de 5xx nas 4 funções; mensagem presa em `pending`; agente mudo em thread ativa; reclamação de operador; latência anormal de envio (o validador adiciona ~1 query por send — se p95 subir visivelmente, avaliar cache).

## Confirmar que `marketing-campaign-enrich` não mudou comportamento

- [ ] T+6h (após 1º cron pós-deploy): logs da função mostram o padrão usual (`Enriching N marketing_campaigns` / `Nothing to enrich`), sem erros novos.
- [ ] Re-rodar a query de baseline: `max(last_synced_at)` **avançou** e a distribuição `success/failed` ≈ baseline (70/2 ± novas campanhas). `failed` disparando = investigar.
- [ ] `admin_notifications` sem alertas novos de "Token Meta expirado" que não existissem antes.

## Rollback

| Cenário | Ação | Tempo |
|---|---|---|
| Validador causando erro/latência nos sends ou agente | Setar secret **`EDGE_AUTH_ENFORCE=off`** (por função ou global) — desliga toda a checagem **sem redeploy** | ~1 min |
| Problema no código deployado em si | `git revert` do(s) commit(s) + push → pipeline redeploya a versão anterior | ~5 min |
| `marketing-campaign-enrich` com comportamento diferente | Improvável (código idêntico); se ocorrer: revert do commit HOLD + push. A v14 ad-hoc **deixa de existir** após o 1º deploy via pipeline — o caminho de volta é sempre via repo | ~5 min |
| Emergência total nos sends | Nada neste deploy bloqueia envio (modo log) — se envio quebrar, a causa é outra; seguir runbook de `operations/README.md` (sintoma → diagnóstico) | — |

## Critério de saída (gate para Fase 2 — enforce)

- [ ] 48h sem `AUTH-OBSERVE` inexplicado (todo would-deny identificado e resolvido/credenciado).
- [ ] `twilio-webhook`: assinatura validando com `matched != none` nos eventos reais.
- [ ] Enrich com comportamento idêntico ao baseline.
- [ ] Só então: `EDGE_AUTH_ENFORCE=enforce` (secret, sem redeploy) — decisão explícita do founder.
