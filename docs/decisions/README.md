# Architecture Decision Records (ADRs)

Numeração `NNNN`. Cada ADR captura contexto → decisão → consequências. Não deletar; revisar por status.

| # | Título | Status |
|---|---|---|
| [0001](0001-multi-tenancy-organization-id.md) | Multi-tenancy via `organization_id` + RLS `ANY(current_user_org_ids())` | Aceito |
| [0002](0002-admin-surface-separate-mfa.md) | Superfície admin separada (`admin_users` + MFA obrigatório) | Aceito |
| [0003](0003-byok-ai-providers.md) | BYOK para providers de IA | Aceito |
| [0004](0004-inbound-events-queue.md) | Pipeline de ingest: fila `integration_inbound_events` + dispatcher | Adotado (legado paralelo) |
| [0005](0005-design-system-seialz-v1.md) | Design System Seialz v1 | Aceito |
| [0006](0006-event-idempotency.md) | Idempotência obrigatória em publicação de eventos | Aceito |
| [0007](0007-drift-rule.md) | Regra do Drift (banco vs repo) | Aceito |
| [0008](0008-domain-ownership-catalog.md) | Ownership por domínio em `reference/catalog.md` | Aceito (markdown por decisão consciente) |
| [0009](0009-inbox-messages-separation.md) | Separação Inbox e Messages (decisão de negócio) | Aceito |
