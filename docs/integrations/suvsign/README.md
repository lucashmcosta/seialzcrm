# SuvSign (assinatura eletrônica)

**Referência técnica:** `docs/audit/04-integracoes/suvsign.md`.

## Finalidade
Geração e assinatura eletrônica de contratos vinculados a oportunidades.

## Webhook
- `suvsign-webhook` — recebe callback de assinatura.
- 🔴 Potencial SSRF: baixa arquivo assinado da URL fornecida sem allowlist — ver dívida.

## Tabelas
`document_types`, `document_submissions` (com FK para `opportunities`).

## Dívida
- Sem instrumentação Sentry (dívida crítica).
- Validar assinatura HMAC do webhook (verificar se implementado).
