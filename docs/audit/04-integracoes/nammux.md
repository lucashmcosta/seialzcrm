# Nammux (ERP externo)

## Fluxo

- **Test connection:** `nammux-test-connection`.
- **Replay opportunity:** `nammux-replay-opportunity` — reemite via `integration-inbound-dispatcher`/`integration-worker`.
- **Download attachment:** `nammux-download-attachment` — anexos remotos → Storage.
- **Audit:** `nammux-audit` — diagnóstico (usa `httpbin.org` para echo — remover em prod).

## Tabelas

`organization_integrations`, `attachments`, `integration_audit_logs`, `integration_events`, `integration_jobs`, `integration_subscriptions`.

## Observações

- Integração baseada em fila (`integration_jobs` + `integration-worker`).
- `nammux-audit` chama `httpbin.org` — dívida de observabilidade; substituir por logging interno.
