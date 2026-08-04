# Evolution API — Monitoramento de estado das instâncias

Última atualização: 2026-08-04

## Problema que este mecanismo resolve

Até 04/08/2026 o estado de uma instância Evolution só era escrito em `evolution_instances` em duas situações:

1. webhook `CONNECTION_UPDATE` recebido do servidor Evolution;
2. ação manual na UI (`evolution-instance-manager`, `op=connectionState`).

Quando uma sessão Baileys morre silenciosamente (ex.: desvinculada no aparelho, motivo `403`), **nenhum webhook chega**. O banco preserva o último rótulo conhecido e `last_state_checked_at` congela. Foi exatamente o caso da instância `dev-int`: sessão caiu em 30/07 14:30, tentativa de reconexão por QR falhou em 03/08 (`refused`, limite de QR), e desde então o estado persistido ficou parado.

Dois defeitos colaterais confirmados na auditoria:

- **`refused` não mapeado** — o `switch` do webhook cobria `open/connected`, `connecting/qr/pairing` e `close/closed/disconnected/logout`; qualquer outro valor caía em `unknown`. O banco registrava `unknown` onde o fato era `close`.
- **Sem verificação periódica** — não existia cron de Evolution, então "instância fora do ar" e "estado desatualizado" eram indistinguíveis para o monitoramento.

## Mapeamento canônico de estado

Fonte única: `supabase/functions/_shared/evolution/state.ts` → `normalizeEvolutionState()`.

| Estado canônico | Valores brutos aceitos |
|---|---|
| `open` | `open`, `connected` |
| `connecting` | `connecting`, `qr`, `qrcode`, `pairing`, `syncing` |
| `close` | `close`, `closed`, `disconnected`, `logout`, `logged_out`, `refused`, `banned`, `conflict`, `replaced`, `unpaired`, `failure`, `error` |
| `unknown` | qualquer string não reconhecida |
| `null` | ausência de valor utilizável (caller decide) |

Estados terminais (sessão inexistente ou invalidada) são `close`, não `unknown`. O webhook (`evolution-webhook`, `extractConnectionState`) e o health check usam o mesmo normalizador, então ambos persistem o mesmo rótulo.

## Verificação periódica — `evolution-health-check`

| Item | Valor |
|---|---|
| Edge Function | `supabase/functions/evolution-health-check/index.ts` |
| Cron | `evolution-health-check`, `*/5 * * * *` |
| Auth | header `x-worker-token` = `INTEGRATION_WORKER_TOKEN` (vault: `integration_worker_token`) |
| Leitura | `evolution_instances` (id, instance_name, organization_id, last_known_state) |
| Chamada externa | `GET /instance/connectionState/{instance}` via `makeEvolutionProvider` |
| Escrita | `evolution_instances.last_known_state`, `last_state_checked_at`, `updated_at` |
| Heartbeat | `outbox_system_heartbeats`, `component = 'evolution-health-check'`, `last_detail = { checked, changed, failures, requestId }` |

Comportamento:

- uma instância que falha na sondagem **não** tem o estado sobrescrito (evita rebaixar por erro de rede); a falha entra em `failures` e em log estruturado;
- mudanças de estado geram log `state_changed` com `from`/`to`;
- o heartbeat é gravado sempre, mesmo com zero instâncias — prova de vida do checker.

Resposta: `{ ok, requestId, checked, changed, failures, instances: [{ instance, ok, state, previous, changed }] }`.

## Reflexo no `service-health`

O serviço `evolution-api` passou a reportar as duas condições separadamente — ver `docs/reference/api/service-health.md`:

- **fora do ar**: `instancesOpen` vs. `instancesClose` / `instancesConnecting` / `instancesUnknown`. Todas fora → `critical`; parte → `warning`.
- **estado desatualizado**: `stateStale = 1` quando `last_state_checked_at` tem mais de 15 min, com `stateAgeSeconds` (`-1` = nunca verificado). Sozinho eleva `healthy` → `warning`; nunca mascara um `critical` real.
- `detail` traz o motivo em texto legível.

## Limite conhecido

Restaurar uma instância em `close` por sessão invalidada exige **reescanear o QR** — ação humana no aparelho. Nenhuma automação de código substitui isso; o health check apenas garante que o estado real apareça no monitoramento em ≤ 5 min.
