# Documentação do Seialz

> 📍 **Estado atual da documentação:** [`STATUS.md`](STATUS.md)



| Pergunta | Onde |
|---|---|
| O que é o sistema? | [`product/`](product/) |
| Como funciona? | [`architecture/`](architecture/) |
| Onde fica determinada funcionalidade? | [`modules/`](modules/) |
| Como uma integração funciona? | [`integrations/`](integrations/) |
| Como a plataforma foi construída? | [`platform/`](platform/) |
| O que fazer quando algo quebra? | [`operations/`](operations/) |
| Por que as coisas são assim? | [`decisions/`](decisions/) — ADRs |
| Referência técnica bruta | [`reference/`](reference/) — **gerado do banco** |
| Histórico congelado | [`audit/`](audit/) — **não modificar** |

## Filosofia

> Pastas podem nascer vazias. Arquivos só nascem quando existe conteúdo verdadeiro.

Nada aqui é inventado. Todo conteúdo é derivado de: código-fonte (`src/`, `supabase/functions/`), banco de dados vivo (`docs/reference/database/`), rotas em `src/App.tsx`, integrações reais e da auditoria em `docs/audit/`.

## Regras
1. Pastas de nível raiz existem todas; arquivo só nasce com conteúdo real (proibido stub vazio).
2. Cada fato mora em UM lugar; os demais linkam.
3. Mudança de schema/trigger/RPC → regenerar `reference/database/` no mesmo PR (queries no rodapé dos arquivos). Ver [ADR-0007](decisions/0007-drift-rule.md).
4. Mudança manual no banco → migration no repo no mesmo dia ([`operations/README.md`](operations/README.md)).
5. Decisão arquitetural → ADR em [`decisions/`](decisions/) (numeração `NNNN`, índice em `decisions/README.md`).
6. `audit/` é histórico datado — **congela, não atualiza**. Drift ativo: [`operations/drift/`](operations/drift/).

## Estado atual (2026-07-04)

### Gerado do banco vivo
- ✅ `reference/database/database-full.md` (117 tabelas, 107 triggers, 232 policies, 15 crons, 88 edge fns)
- ✅ `reference/database/trigger-functions.sql` (48 trigger functions)
- ✅ `reference/catalog.md` — ownership de cada objeto por domínio

### Mantido manualmente
- ✅ `product/` — módulos, navegação, permissões, terminologia PT↔EN
- ✅ `architecture/` — visão + fluxos de evento
- ✅ `modules/` — 14 módulos × (README + data-model)
- ✅ `integrations/` — 12 integrações
- ✅ `platform/` — database, security, observability, performance, infrastructure, deployment
- ✅ `operations/` — Regra do Drift, runbook, cron, arquitetura de filas
- ✅ `decisions/` — 8 ADRs
- ✅ `operations/drift/2026-07-04.md` — 8 pendências P0–P2
- ✅ `operations/conflicts.md` — divergências descoberta ↔ repo

### Congelado
- `audit/` — 90 fichas de edge functions, 13 de integrações, análises de dívida e cron.

## Convenções

- Marcadores `[INCERTO]` sinalizam afirmações não 100% confirmadas — herdado da auditoria.
- Priorização de dívida técnica: 🔴 alta, 🟡 média, 🟢 baixa.
- Nomes de arquivos e pastas em `kebab-case`.
- Toda tabela `public.*` obedece a política RLS `organization_id = ANY(current_user_org_ids())` salvo exceção documentada.

## Gerado vs mantido manualmente

| Tipo | Modo |
|---|---|
| `audit/**` | Congelado (registro histórico da auditoria manual) |
| `reference/database/**` | **Regenerado** do banco vivo (queries no rodapé dos arquivos) |
| `reference/catalog.md` | Mantido manualmente com base no banco (ADR-0008) |
| `operations/drift/**` | Datado por descoberta — some quando o item é resolvido |
| Tudo o mais | Mantido manualmente com base em evidência |

## Referências rápidas
- Auditoria congelada: [`audit/00-PROGRESS.md`](audit/00-PROGRESS.md)
- Design system: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
- Ícones: [`ICON_SYSTEM.md`](ICON_SYSTEM.md)
- Regras para agentes/devs: ver [ADR-0007](decisions/0007-drift-rule.md) e [`operations/README.md`](operations/README.md).
