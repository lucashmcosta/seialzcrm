# Documentação Seialz CRM

Esta pasta é a fonte oficial de documentação do projeto. Ela é construída sobre a auditoria técnica completa em `docs/audit/` (registro histórico, imutável) e organizada por área de leitura.

## Filosofia

> Pastas podem nascer vazias. Arquivos só nascem quando existe conteúdo verdadeiro.

Nada aqui é inventado. Todo conteúdo é derivado de: código-fonte (`src/`, `supabase/functions/`, `supabase/migrations/`), banco de dados, rotas registradas em `src/App.tsx`, hooks, integrações reais e da auditoria em `docs/audit/`.

## Mapa das pastas

| Pasta | Propósito | Origem do conteúdo |
|---|---|---|
| `product/` | Terminologia, módulos, mapa de navegação, permissões | Rotas + páginas + `permission_profiles` |
| `architecture/` | Visão de alto nível, fluxo de eventos | `docs/audit/01-overview.md`, `03-frontend-*`, `05-multi-tenancy.md` |
| `modules/<modulo>/` | Um README + `data-model.md` por módulo real do sistema | Rotas, tabelas, hooks e componentes por domínio |
| `integrations/<integracao>/` | Uma ficha por integração externa | `docs/audit/04-integracoes/` |
| `platform/` | Database, security, observability, performance, infra, deploy | `docs/audit/05-multi-tenancy.md`, `06-cron-automacoes.md`, `07-divida-tecnica.md` |
| `operations/` | Runbooks operacionais | Incidentes reais identificados na auditoria |
| `decisions/` | ADRs (Architecture Decision Records) | Decisões evidentes no código |
| `audit/` | **Registro histórico da auditoria — NÃO MODIFICAR** | Congelado |
| `reference/` | Material regenerável (schema, API, eventos) | Gerado a partir do Supabase / código |

## Como navegar

- **Novo no projeto?** Comece por `architecture/overview.md`, depois `product/modules.md`.
- **Trabalhando em um módulo?** Vá para `modules/<modulo>/README.md`.
- **Integrando com um sistema externo?** `integrations/<nome>/README.md`.
- **Investigando incidente ou dívida?** `operations/` + `docs/audit/07-divida-tecnica.md`.
- **Precisa de schema ou payload?** `reference/`.

## Convenções

- Marcadores `[INCERTO]` sinalizam afirmações não 100% confirmadas — herdado da auditoria.
- Priorização de dívida técnica: 🔴 alta, 🟡 média, 🟢 baixa.
- Toda tabela `public.*` obedece a política RLS `organization_id = ANY(current_user_org_ids())` salvo exceção documentada.
- Nomes de arquivos e pastas em `kebab-case`.

## Gerado vs mantido manualmente

| Tipo | Modo |
|---|---|
| `docs/audit/**` | Congelado (registro histórico) |
| `docs/reference/generated/**` | Regenerável automaticamente a partir do Supabase/código |
| `docs/reference/database/**` | Regenerável (schema, RLS, RPCs) |
| Tudo o mais | Mantido manualmente com base em evidência |

## Referências rápidas

- Auditoria completa: [`audit/00-PROGRESS.md`](audit/00-PROGRESS.md)
- Visão geral do stack: [`audit/01-overview.md`](audit/01-overview.md)
- Design system: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
- Ícones: [`ICON_SYSTEM.md`](ICON_SYSTEM.md)
