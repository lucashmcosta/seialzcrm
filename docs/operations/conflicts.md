# Conflitos: Descoberta (banco vivo 2026-07-04) × Repositório

Este arquivo registra divergências entre a documentação que existia no repositório (auditoria manual sobre o código) e a descoberta técnica feita diretamente no banco de produção `qvmtzfvkhkhkhdpclzua`.

**Regra:** onde há conflito, o banco vivo é a fonte de verdade — a documentação do repo foi atualizada; `docs/audit/` foi mantido intocado como registro histórico.

## Conflitos numéricos

| Item | Auditoria do repo (`docs/audit/`) | Descoberta (banco vivo) | Ação tomada |
|---|---|---|---|
| Migrations SQL | 261 (arquivos no repo) | **184 aplicadas** no banco | Divergência real — drift #4. Mantido registro nos dois lugares. |
| Edge functions | 90 no repo | **88 deployadas** no banco (+ 3 fora do repo) | Ver drift #2. |
| Tabelas em `public` | ~112 listadas em `<supabase-tables>` | **117 tabelas** | Contagem oficial em `docs/reference/database/database-full.md`. |
| Cron jobs | 14 catalogados | **15 ativos** — faltava `integration-inbound-events-cleanup` (03:00 diário) | Atualizado em `docs/operations/README.md`. |
| Triggers | menção qualitativa "vários por tabela" | **107 triggers ativas** | Mapa completo em `docs/reference/database/database-full.md`. |
| Policies RLS | não contabilizado | **232 policies, 0 tabelas sem RLS** | Adicionado em `docs/platform/database/README.md`. |

## Conflitos de fato

### 1. Triggers de auditoria duplicadas (contacts, opportunities, tasks)
- **Repo dizia:** apenas `<X>_audit_trigger` combinada.
- **Banco tem:** `audit_<X>_insert` + `audit_<X>_update` + `audit_<X>_delete` **+** `<X>_audit_trigger` combinada → gravação em dobro.
- **Impacto:** `audit_logs` = 292 K linhas / **463 MB** (maior objeto do banco).
- **Ação:** drift P0 #1 registrado em `docs/operations/drift/2026-07-04.md`.

### 2. Edge functions fora do repo
- `twilio-message-debug`, `meta-capi-raw-test`, `marketing-campaign-enrich` foram deployadas ad-hoc via dashboard, com entrypoint `source/index.ts` em vez de `source/supabase/functions/...`.
- **Crítico:** `marketing-campaign-enrich` roda em cron a cada 6 h e por trigger — código de produção sem versionamento.
- **Ação:** drift P0 #2. `docs/integrations/meta-*` e `docs/modules/marketing/` marcam a fn com ⚠️.

### 3. `scheduled-messages-cron` órfã
- Repo trata como cron ativo (documentação anterior mencionava scheduled follow-ups).
- Banco vivo: function deployada (v275) mas **nenhum job de pg_cron a invoca**.
- **Ação:** drift P1 #3. `docs/modules/ai-agent/` e `docs/audit/06-cron-automacoes.md` já sinalizavam como `[INCERTO]`.

### 4. `verify_jwt=false` em ~todas as 88 functions
- Repo não documentava explicitamente.
- Banco: `verify_jwt: false` generalizado — pode ser intencional (auth própria via `_shared/auth.ts`) mas exige confirmação function por function, principalmente `admin-impersonate*`, `create-user`, `byok-*`.
- **Ação:** drift P1 #5. Matriz "function × mecanismo de auth" precisa ser criada em `docs/platform/security/`.

### 5. Tabelas de backfill/backup órfãs (8)
| Tabela | Linhas |
|---|---|
| `backup_meta_backfill_2026_05_28_contacts` | 0 |
| `opportunities_status_backup_20260512` | 1.559 |
| `messages_endpoint_backfill_2b` | **92.106** |
| `message_threads_business_context_backfill` | 17.285 |
| `message_threads_business_context_backfill_20260703` | 308 |
| `message_threads_business_context_backfill_null_20260703` | 38 |
| `message_threads_primary_endpoint_backfill` | 3.967 |
| `viagi_csv_staging_2026_05_28` | listado só no repo |

- **Ação:** drift P2 #6. Convenção nova: backfill em schema `_scratch`, nunca em `public`.

### 6. UUID de org hardcoded em trigger
- `parse_lead_source_marker_from_message` tem UUID da Central Trabalhista embutido ("escopo v1").
- **Ação:** drift P2 #8 (não urgente).

### 7. Overloads duplicados
- `rpc_list_message_threads` com 2 overloads.
- `validate_message_analysis_v2` + `v21` (duas triggers na mesma tabela `message_analyses`).
- `assign_round_robin` com 2 assinaturas.
- **Ação:** drift P2 #7.

## Conflitos de convenção

### Naming de módulos
- Descoberta veio em PT (`contatos`, `atendimento`, `campanhas`, ...) — apenas placeholders.
- Repo já usa EN (`contacts`, `messages`, `marketing`, ...).
- **Decisão:** manter estrutura EN atual (alinhada com nomes de tabelas e código). Mapeamento PT ↔ EN em [`docs/product/terminology.md`](../product/terminology.md).

### Domínio `knowledge-ai` vs módulos separados
- Descoberta agrupa em `knowledge-ai`.
- Repo separou em `modules/ai-agent/` + `modules/knowledge-base/`.
- **Decisão:** manter separado — reflete o código (`ai_agents` e `knowledge_items` são superfícies distintas na UI) e o `catalog.md` cita ownership compartilhada em vez de sobreposição total.

### Domínio `assignment` (round-robin)
- Descoberta trata como domínio próprio (`domains/assignment/`).
- Repo tratava como sub-tópico dentro de mensagens/oportunidades.
- **Ação:** aceita — abre-se lugar futuro para `docs/modules/assignment/` quando houver conteúdo próprio (por ora vive nas menções em cada módulo).

## Objetos "sem dono" (do `catalog.md`)

`documentation`, `compliance_blocks`, `coupons` / `coupon_redemptions`, `saved_views`, `support_categories`, `support_sla_configs`, `webhook_field_mappings`, `organization_usage_metrics`, `import_logs` — classificar em próxima onda.

## Diferenças de framing

- **CLAUDE.md / AGENTS.md** do pacote traz 10 "regras invioláveis" — incorporadas em ADRs (`decisions/0006` a `0008`) e em `platform/security/README.md`.
- **Runbook** do pacote é mais denso que o inicial do repo — substituiu integralmente `operations/README.md`.
- **`docs/reference/catalog.md`** (ownership por domínio) é novo — vem direto do banco vivo, adotado como fonte de verdade para ownership.
