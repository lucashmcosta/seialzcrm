# SuvSign (assinatura eletrônica)

**Referência técnica:** `docs/audit/04-integracoes/suvsign.md`.

## Finalidade
Geração e assinatura eletrônica de contratos vinculados a oportunidades.

## Webhook
- `suvsign-webhook` — recebe callback de assinatura.
- Valida HMAC e restringe `file_url` a hosts permitidos.
- Deduplica callbacks pelo identificador estável do documento no provedor.
- Contratos ligados a oportunidades já ganhas entram no outbox do Nammux pelo
  fluxo descrito na [ADR-0010](../../decisions/0010-post-win-document-sync.md).

## Tabelas
`documents`, `document_types`.

## Dívida
- Sem instrumentação Sentry (dívida crítica).
