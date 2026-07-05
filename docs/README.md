# Documentação do Seialz

> 📍 **Estado atual da documentação:** [`STATUS.md`](STATUS.md) · **Como contribuir:** [`CONTRIBUTING.md`](CONTRIBUTING.md) · **Setup:** [`getting-started.md`](getting-started.md)

| Pergunta | Onde |
|---|---|
| Como rodar/deployar o projeto? | [`getting-started.md`](getting-started.md) |
| O que é o sistema? | [`product/`](product/) |
| Inbox × Messages — qual a diferença? | [`product/channel-boundaries.md`](product/channel-boundaries.md) — **decisão de negócio** |
| Como funciona? | [`architecture/`](architecture/) |
| Onde fica determinada funcionalidade? | [`modules/`](modules/) |
| Como uma integração funciona? | [`integrations/`](integrations/) |
| Como a plataforma foi construída? | [`platform/`](platform/) |
| O que fazer quando algo quebra? | [`operations/`](operations/) |
| Por que as coisas são assim? | [`decisions/`](decisions/) — ADRs |
| Referência técnica bruta | [`reference/`](reference/) — **gerado do banco** |
| App mobile (React Native/Expo) | [`mobile/`](mobile/) |
| Planos/specs em andamento | [`plans/`](plans/) e [`inbox-v2/`](inbox-v2/) |
| Histórico congelado | [`audit/`](audit/) — **não modificar** |

## Filosofia

> Pastas podem nascer vazias. Arquivos só nascem quando existe conteúdo verdadeiro.

Nada aqui é inventado. Todo conteúdo é derivado de: código-fonte (`src/`, `supabase/functions/`), banco de dados vivo (`docs/reference/database/`), rotas em `src/App.tsx`, integrações reais e da auditoria em `docs/audit/`.

## Regras

Detalhadas em [`CONTRIBUTING.md`](CONTRIBUTING.md). As seis inegociáveis:

1. Arquivo só nasce com conteúdo real (proibido stub vazio).
2. Cada fato mora em UM lugar; os demais linkam.
3. Mudança de schema/trigger/RPC → regenerar `reference/database/` no mesmo PR ([ADR-0007](decisions/0007-drift-rule.md)).
4. Mudança manual no banco → migration no repo no mesmo dia ([`operations/README.md`](operations/README.md)).
5. Decisão arquitetural → ADR em [`decisions/`](decisions/).
6. `audit/` é histórico datado — **congela, não atualiza**. Drift ativo: [`operations/drift/`](operations/drift/).

## Gerado vs mantido manualmente

| Tipo | Modo |
|---|---|
| `audit/**` | Congelado (registro histórico da auditoria manual) |
| `reference/database/**` | **Regenerado** do banco vivo (queries no rodapé dos arquivos) |
| `reference/catalog.md` | Mantido manualmente com base no banco (ADR-0008) |
| `operations/drift/**` | Datado por descoberta — some quando o item é resolvido |
| `plans/**` | Temporário — apagado/migrado após implementação |
| Tudo o mais | Mantido manualmente com base em evidência |

## Convenções

- Marcadores `[INCERTO]` (afirmação não confirmada) e `[TODO]` (lacuna conhecida).
- Priorização de dívida técnica: 🔴 alta, 🟡 média, 🟢 baixa.
- Nomes de arquivos e pastas em `kebab-case`.
- Toda tabela `public.*` obedece a política RLS `organization_id = ANY(current_user_org_ids())` salvo exceção documentada.

## Referências rápidas

- Inventário completo do que está documentado: [`STATUS.md`](STATUS.md)
- Design system: [`product/design/design-system.md`](product/design/design-system.md)
- Ícones: [`product/design/icon-system.md`](product/design/icon-system.md)
- Ownership de cada objeto do banco: [`reference/catalog.md`](reference/catalog.md)
- Auditorias operacionais pontuais: [`operations/audits/`](operations/audits/)
- Auditoria congelada: [`audit/00-PROGRESS.md`](audit/00-PROGRESS.md)
- Regras para agentes/devs: [`CONTRIBUTING.md`](CONTRIBUTING.md), [ADR-0007](decisions/0007-drift-rule.md)
