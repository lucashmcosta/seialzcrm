# 09 — Refinamento da Documentação (2026-07-05)

Registro congelado da rodada de refinamento executada em 2026-07-05, em sequência à auditoria de documentação da mesma data. Numeração salta de 07 para 09 porque 08 não existe na série original (mantida a numeração pedida na tarefa).

---

## 1. Alterações realizadas

### Decisão de negócio formalizada: Inbox × Messages
- Criado `product/channel-boundaries.md` — define oficialmente que **Inbox (atendimento/pós-venda) e Messages (comercial/pré-venda) são módulos distintos por decisão de negócio**, com ownership, fluxo de vida, regras de roteamento (`business_context`, `communication_endpoints.purpose`, `senderContext`, re-rota lazy em `dispatchWhatsAppSend`) e riscos de uma futura unificação.
- `modules/messages/README.md` e `modules/inbox/README.md` reescritos com o enquadramento oficial (antes descreviam Messages como "legado" aguardando "cutover" para o Inbox). Esclarecido que "legado" se refere ao caminho técnico de ingestão (ADR-0004), não ao módulo de produto.
- `product/modules.md` e ADR-0004 ajustados na mesma direção; `reference/catalog.md` aponta a separação no mapa de domínios.

### `reference/catalog.md`
- Corrigidos **todos os caminhos quebrados** da coluna "Doc" (`domains/*`, `platform/TENANCY-SECURITY.md`, `integrations/whatsapp/` etc. → paths reais em `modules/`, `integrations/`, `platform/`, `operations/`).
- Adicionada tabela **Domínio Técnico | Módulo de Produto | Documentação Principal** reconciliando as duas taxonomias (messaging → messages+inbox; knowledge-ai → ai-agent+knowledge-base; tenancy-security → admin+settings+billing; etc.).

### Autossuficiência (referências a memories)
- Removidas **todas** as ~60 referências `memory \`...\`` / `memories` fora de `docs/audit/` (30 arquivos em modules, integrations, platform, product, architecture, decisions).
- Fatos verificados no código ganharam âncoras reais (ex.: `use-mobile.tsx`, `retryImport` em `src/App.tsx`, `endpointPurpose.ts`, `trg_update_thread_last_message`, `organizations.theme_preset`).
- Fatos não reconstituíveis mantidos com `[INCERTO]` explícito (2 casos: regra exata de grandfathering em billing; detalhe do loop de recálculo de triggers em performance).
- `docs/audit/**` mantido intocado (referências históricas a memories permanecem lá, como registro).

### Novos documentos de entrada
- `getting-started.md` — pré-requisitos (Node 24, npm), setup local, env vars (a partir de `.env.example`), frontend, Supabase, migrations, edge functions, deploy (Vercel + Lovable), troubleshooting. Lacunas marcadas: `[TODO]` fluxo Supabase CLI local; `[INCERTO]` fluxo exato de aplicação de migrations.
- `CONTRIBUTING.md` — convenções, nomenclatura, gerado×manual×congelado, quando atualizar doc, como documentar módulo novo, como evitar drift. Inclui a regra "não sugerir fusão Inbox/Messages" e a proibição de referências a memories.

### Reorganização da raiz de `docs/` (via `git mv`, histórico preservado)
| Antes | Depois |
|---|---|
| `DESIGN_SYSTEM.md` | `product/design/design-system.md` |
| `ICON_SYSTEM.md` | `product/design/icon-system.md` |
| `MOBILE_APP_CONTEXT.md` | `mobile/app-context.md` |
| `MOBILE_APP_BACKEND.md` | `mobile/backend-reference.md` |
| `MOBILE_DASHBOARD.md` | `mobile/dashboard-spec.md` |
| `PLAN_SNIPPETS_INTERNOS.md` | `plans/2026-07-snippets-internos.md` |
| `AUDITORIA_7020.md` | `operations/audits/2026-07-whatsapp-7020.md` |
| `AUDITORIA_CTWA.md` | `operations/audits/2026-07-ctwa-janela-72h.md` |

- Criados índices: `mobile/README.md`, `plans/README.md` (com ciclo de vida de planos). `docs/inbox-v2/` permaneceu no lugar (SQL numerado referenciado por outros docs), listado como workstream em `plans/README.md`.
- Links internos dos arquivos movidos corrigidos.

### Índices e deduplicação
- `README.md`: tabela de roteamento ganhou getting-started, channel-boundaries, mobile/, plans/; seção "Estado atual" (duplicada com STATUS) removida — agora só aponta para `STATUS.md`; referências rápidas atualizadas para os novos paths.
- `STATUS.md`: seção 4 deixou de transcrever os 8 itens de drift (agora fonte única em `operations/drift/2026-07-04.md`); tabela "Onde olhar" (duplicada com README) removida; inventário atualizado com as novas seções.
- Correção factual: `platform/infrastructure/README.md` dizia 14 cron jobs; corrigido para 15 (conforme descoberta do banco vivo).

---

## 2. Gaps restantes

1. `reference/api/`, `reference/events/`, `reference/generated/` continuam vazios (geração pendente — itens 3 e 4 da próxima onda em `STATUS.md`).
2. Módulos ainda finos: `billing`, `tasks`, `companies`, `admin` (READMEs < 20 linhas). Conteúdo é real, mas abaixo da massa crítica.
3. Sem CI de verificação de links — os paths quebrados do `catalog.md` só foram detectados manualmente; tende a reincidir.
4. Contagens datadas de 2026-07-04 espalhadas pelos `data-model.md` sem processo de refresh além da regra do ADR-0007.
5. Runbooks por incidente concreto ainda não escritos.
6. Drift P0/P1/P2 de banco (triggers duplicadas, functions shadow, migrations 261↔184) segue aberto — fora do escopo desta rodada (documental).

## 3. Incertezas registradas

- `[INCERTO]` regra exata de grandfathering de preço/trial (`modules/billing/README.md`) — o detalhe vivia em memória de agente perdida; validar no código de billing antes de alterar.
- `[INCERTO]` detalhe do loop de recálculo entre triggers de mensagens evitado no passado (`platform/performance/README.md`).
- `[INCERTO]` fluxo exato de aplicação de migrations (CLI vs ferramenta Lovable) — `getting-started.md`.
- `[TODO]` desenvolvimento local com Supabase CLI não padronizado — hoje dev aponta para produção via anon key + RLS.
- Semântica de "cutover" do Inbox v2 pós-`channel-boundaries.md`: o rollout técnico (fila de ingest, flag) segue valendo; o que muda é que `/messages` não será desativado. Se houver divergência de entendimento, formalizar em ADR.

## 4. Recomendações futuras

1. **ADR-0009 — Separação Inbox × Messages**: promover a decisão de `channel-boundaries.md` a ADR formal (é decisão arquitetural com consequências de dados e permissões).
2. **Link-check em CI**: um passo simples (ex.: `lychee` ou script grep) sobre `docs/**/*.md` evitaria nova geração de paths quebrados.
3. **Gerar `reference/events/` e `reference/api/`** conforme próxima onda — maior lacuna real de conteúdo.
4. **Padronizar dev local** (Supabase CLI + banco local ou branch) e remover o `[TODO]` do getting-started — dev direto contra produção é risco operacional.
5. **Engordar módulos finos** quando houver mexida neles (regra do CONTRIBUTING: doc no mesmo PR), em vez de rodada dedicada.
