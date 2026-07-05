# ADR 0007 — Regra do Drift

**Status:** Aceito.
**Evidência:** `docs/operations/drift/2026-07-04.md` (banco 184 migrations vs repo 261; 3 functions fora do Git; 8 tabelas de backfill órfãs).

## Contexto
Divergência real detectada entre produção e repositório em 2026-07 gerou risco de rollback quebrado, código não versionado em cron crítico e tabelas de backup órfãs sem prazo de expurgo.

## Decisão
1. **Toda mudança manual no banco de produção** (SQL Editor, dashboard) exige a **migration correspondente commitada no repo no MESMO DIA**. Sem exceção.
2. **Deploy de edge function apenas via repo** — nunca pelo dashboard.
3. **Backfill / backup temporário** vive em schema `_scratch`, nunca em `public`; nome inclui data e prazo de expurgo.
4. **Alteração de schema / trigger / RPC** exige regenerar `docs/reference/database/database-full.md` e `trigger-functions.sql` no mesmo PR (queries de regeneração no rodapé desses arquivos).
5. **Novas triggers de auditoria/denormalização** exigem ADR próprio — histórico: trigger de denormalização causou 3.7 M requests/dia; auditoria duplicada gerou 463 MB.

## Consequências
- Ambiente reprodutível e auditável.
- Zero surpresa em rollback / restore.
- Runbook simplificado (drift ativo é sempre uma lista pequena).
- Onboarding de agentes/devs consulta uma única fonte para reconciliar código × banco.
