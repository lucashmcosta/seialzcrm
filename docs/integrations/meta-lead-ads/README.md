# Meta Lead Ads

**Referência técnica:** `docs/audit/04-integracoes/meta-lead-ads.md` e `docs/audit/02-edge-functions/meta-lead-ads-*`.

## Finalidade
Polling de leadgen forms Meta → cria contatos/oportunidades.

## Autenticação
- Token de Página Meta, cifrado em `organization_integrations`.
- Onboarding: `meta-lead-ads-connect` → seleção de páginas → `meta-lead-ads-discover`.

## Polling
- Cron `meta-lead-ads-poll` (`*/3 * * * *`, autenticado via vault + service_role).
- Processamento: `meta-lead-ads-process-lead` — dedupe (memory `leads/webhook-duplicate-prevention-logic`).

## Saúde
- `meta-lead-ads-token-health` (diário 08:00 UTC) — diagnóstico + `admin_notifications` em caso de erro.

## Recuperação Viagi (one-shot)
- `meta-lead-ads-backfill-viagi`, `meta-lead-ads-recovery-viagi`, `meta-lead-ads-viagi-token-probe`, `viagi-staging-loader` — código para caso específico do cliente Viagi. `viagi-staging-loader` provavelmente quebrado (import npm inexistente — ver `07-divida-tecnica.md`).

## Tabelas
`meta_lead_pages`, `lead_forms`, `lead_form_questions`, `marketing_attribution_*`.

## Falhas comuns
- Token de página revogado → aviso via `meta-lead-ads-token-health`.
- Form arquivado → poll ignora.
- Lead duplicado → dedupe conforme configuração de webhook.
