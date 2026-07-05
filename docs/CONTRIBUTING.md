# CONTRIBUTING — como manter esta documentação

Regras para humanos e agentes que alteram código ou documentação. Complementa o [`README.md`](README.md) (mapa) e o [`getting-started.md`](getting-started.md) (setup).

## Convenções

1. **Nada aqui é inventado.** Todo conteúdo deriva de evidência: código (`src/`, `supabase/functions/`), banco vivo (`reference/database/`), auditorias (`audit/`, `operations/audits/`) ou decisão registrada (ADR).
2. **Cada fato mora em UM lugar; os demais linkam.** Antes de escrever, procure onde o fato já vive.
3. **Arquivo só nasce com conteúdo real** — proibido stub vazio. Pastas de categoria podem existir vazias.
4. **Marcadores:** `[INCERTO]` para afirmação não 100% confirmada; `[TODO]` para lacuna conhecida. Dívida: 🔴 alta, 🟡 média, 🟢 baixa.
5. **Sem referências a memórias de agente.** Documentação precisa ser autossuficiente: o fato entra no arquivo, com âncora em código (`src/...`, função, tabela). Referências `memory ...` são links mortos para qualquer outro leitor.
6. **Não sugerir fusão de Inbox e Messages.** A separação é decisão de negócio — ver [`product/channel-boundaries.md`](product/channel-boundaries.md).

## Nomenclatura

- Arquivos e pastas em `kebab-case` (ex.: `channel-boundaries.md`), sem `SCREAMING_CASE`.
- Módulos/domínios em EN, alinhados a nomes de tabela (`contacts`, não `contatos`) — mapeamento PT↔EN em [`product/terminology.md`](product/terminology.md).
- ADRs: `decisions/NNNN-slug.md`, numeração sequencial, índice em `decisions/README.md`.
- Planos: `plans/YYYY-MM-slug.md` (ciclo de vida em [`plans/README.md`](plans/README.md)).
- Auditorias operacionais pontuais: `operations/audits/YYYY-MM-slug.md` (read-only após concluídas).

## Gerado × manual × congelado

| Tipo | Modo | Regra |
|---|---|---|
| `reference/database/**` | **Gerado** do banco vivo | Nunca editar à mão; regenerar com as queries no rodapé de cada arquivo |
| `reference/catalog.md` | Manual sobre o banco | Objeto novo (tabela/trigger/edge fn) sem linha aqui = doc incompleta |
| `audit/**` | **Congelado** | Histórico datado — não modificar; correções vivem em `operations/drift/` e `operations/conflicts.md` |
| `operations/drift/**` | Datado | Item some quando resolvido |
| `plans/**` | Temporário | Apagar/migrar após implementação |
| Todo o resto | Manual | Mantido com base em evidência |

## Quando atualizar documentação

No **mesmo PR** da mudança:

- Mudou schema/trigger/RPC → regenerar `reference/database/` + atualizar `reference/catalog.md` e o `data-model.md` do módulo dono ([ADR-0007](decisions/0007-drift-rule.md)).
- Nova edge function → linha no `catalog.md` + menção no módulo/integração dono.
- Nova rota → `product/modules.md` e `product/navigation-map.md`.
- Decisão arquitetural (novo padrão, nova trigger de auditoria/denormalização, nova fila) → ADR novo em `decisions/`.
- Nova env var → `.env.example` + `getting-started.md`.
- Mudança que afeta o escopo mobile v1 → `mobile/` antes de implementar no app.

No **mesmo dia** (Regra do Drift, inegociável): mudança manual no banco de produção → migration commitada; deploy de edge function só via repo, nunca pelo dashboard.

## Como documentar um novo módulo

1. Criar `modules/<nome>/README.md` — propósito de negócio (área, público, objetivo), rotas, comportamentos-chave com âncoras de código.
2. Criar `modules/<nome>/data-model.md` — tabelas (com contagem de linhas datada), triggers, RLS, RPCs, hooks.
3. Adicionar linha em `product/modules.md` e, se tiver vocabulário próprio, em `product/terminology.md`.
4. Registrar ownership dos objetos novos em `reference/catalog.md` (tabela de domínios **e** mapa domínio↔módulo, se aplicável).
5. Checklist de banco ([ADR-0001](decisions/0001-multi-tenancy-organization-id.md)): `GRANT` explícito + `ENABLE RLS` + policy `organization_id = ANY(current_user_org_ids())`.

## Como evitar drift

- **Banco ≠ repo é o inimigo nº 1** (histórico: 3 edge functions shadow, 77 migrations de diferença, 8 tabelas de backfill órfãs).
- Backfill/backup temporário: schema `_scratch`, nunca `public`, com data no nome e prazo de expurgo.
- Nenhuma trigger de auditoria/denormalização nova sem ADR próprio (histórico: triggers duplicadas geraram 463 MB em `audit_logs`).
- Divergência descoberta entre doc e realidade → registrar em `operations/drift/YYYY-MM-DD.md` (P0–P2) em vez de corrigir silenciosamente; a doc afetada ganha ⚠️ com link.
- Contagens e snapshots levam data explícita (ex.: "linhas em 2026-07-04") para envelhecerem de forma honesta.
