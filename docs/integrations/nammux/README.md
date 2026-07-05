# Nammux (ERP)

**Referência técnica:** `docs/audit/04-integracoes/nammux.md`.

## Finalidade
Integração com ERP Nammux para sincronizar oportunidades e anexos.

## Edge functions
- `nammux-test-connection`
- `nammux-audit` — ⚠ ainda chama `httpbin.org` (dívida — remover).
- `nammux-replay-opportunity`
- `nammux-download-attachment` — 🔴 SSRF (fetch de URL externa sem allowlist).

## Autenticação
Credenciais por org em `organization_integrations` (cifradas).

## Dívida
Ver `docs/audit/07-divida-tecnica.md`.
