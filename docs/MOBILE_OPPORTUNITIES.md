# Mobile — Módulo de Oportunidades

Documento de referência para implementação do módulo de Oportunidades no app mobile. Baseado em inspeção direta do schema atual, das policies RLS e dos componentes web (`OpportunityDialog`, `CloseDatePromptDialog`, `OpportunitiesKanban`, `OpportunityDetail`, `MobileOpportunitiesKanban`).

Sem código de UI — apenas schema, regras e fluxos.

---

## 1. Schema completo — `public.opportunities`

29 colunas hoje em produção.

### Identidade / tenancy
| Coluna | Tipo | Null | Default | Observação |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `organization_id` | `uuid` | NO | — | Obrigatório em toda inserção |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | Atualizado por trigger `update_opportunities_updated_at` |
| `deleted_at` | `timestamptz` | YES | — | Soft-delete. **Sempre filtrar `IS NULL`** |

### Negócio
| Coluna | Tipo | Null | Default | Observação |
|---|---|---|---|---|
| `title` | `text` | NO | — | Obrigatório |
| `amount` | `numeric` | YES | `0` | Valor monetário |
| `currency` | `text` | YES | `'BRL'` | Default da organização: `organization.default_currency` |
| `status` | `opportunity_status` | YES | `'open'` | Enum: `open \| won \| lost`. **Sincronizado por trigger** (ver §2) |
| `close_date` | `date` | YES | — | Obrigatório ao ganhar/perder (ver §7) |
| `pipeline_stage_id` | `uuid` | NO | — | FK `pipeline_stages.id` |
| `is_sample` | `bool` | YES | `false` | Dados de demo/seed |

### Vínculos
| Coluna | Tipo | Null | Observação |
|---|---|---|---|
| `contact_id` | `uuid` | YES | FK `contacts.id` |
| `company_id` | `uuid` | YES | FK `companies.id` — só usar se `organization.enable_companies_module` |
| `owner_user_id` | `uuid` | YES | **`users.id` interno** (não `auth.uid()`). Se `NULL` no INSERT, trigger `opportunities_round_robin` atribui automaticamente |

### Auditoria
| Coluna | Tipo | Observação |
|---|---|---|
| `created_by` | `uuid` | `users.id` — preencher no INSERT |
| `updated_by` | `uuid` | `users.id` — preencher em cada UPDATE |

### Origem / atribuição (marketing)
| Coluna | Tipo | Default |
|---|---|---|
| `source` | `text` | `'manual'` |
| `source_external_id` | `text` | — |
| `utm_source` | `text` | — |
| `utm_medium` | `text` | — |
| `utm_campaign` | `text` | — |
| `utm_content` | `text` | — |
| `utm_term` | `text` | — |
| `attribution_data` | `jsonb` | `'{}'` |
| `attribution_locked_at` | `timestamptz` | — |
| `marketing_campaign_id` | `uuid` | FK `marketing_campaigns.id` |

Estes campos são preenchidos por integrações (Meta Lead Ads, webhooks, etc.). **No mobile: read-only**. Não expor edição.

### IA / scoring (read-only)
| Coluna | Tipo | Observação |
|---|---|---|
| `health_score` | `int` | Populado por jobs |
| `ghosting_risk_score` | `int` | Populado por jobs |

### O que **não existe** hoje
- `probability` — não tem coluna.
- `lost_reason` — não tem coluna. Não pedir motivo ao marcar como perdida.
- `pipeline_id` — não existe. É um funil único por org (ver §2).

Não inventar esses campos no mobile.

---

## 2. Pipeline e estágios

### Tabela `public.pipeline_stages`
| Coluna | Tipo | Null | Observação |
|---|---|---|---|
| `id` | `uuid` | NO | |
| `organization_id` | `uuid` | NO | |
| `name` | `text` | NO | |
| `order_index` | `int` | NO | Ordem crescente do funil |
| `type` | `pipeline_stage_type` | YES | Enum: `custom \| won \| lost` |
| `created_at`/`updated_at` | `timestamptz` | YES | |

Não existe tabela `pipelines`. **Todos os `pipeline_stages` de uma org formam um único funil**, ordenados por `order_index`.

### Regra crítica: status é derivado do estágio
Trigger `trg_sync_opportunity_status_from_stage` (BEFORE INSERT/UPDATE) faz:

- estágio `type='won'`  → `status = 'won'`
- estágio `type='lost'` → `status = 'lost'`
- estágio `type='custom'` → `status = 'open'`

**Implicação para o mobile**: ao mover a oportunidade de etapa, envie apenas `pipeline_stage_id` (+ `close_date` quando exigido). **Não envie `status` manualmente** — é redundante e pode gerar conflito com o trigger.

### Kanban vs. lista no mobile
O web renderiza kanban com drag-and-drop entre colunas (`OpportunitiesKanban.tsx`). No mobile já existe o padrão em `MobileOpportunitiesKanban.tsx`:

- Chips horizontais com os estágios (nome + contador).
- Lista vertical dos cards do estágio ativo.
- Mudança de estágio via bottom sheet / menu no card (sem drag).

**Recomendação**: seguir esse padrão. Drag-and-drop entre colunas em nativo não vale o esforço para MVP.

---

## 3. RLS e permissões

### Policies em `opportunities`
```
SELECT: is_admin_user()
     OR (organization_id = ANY(current_user_org_ids())
         AND deleted_at IS NULL
         AND (user_can_view_all(organization_id, 'opportunities')
              OR owner_user_id = current_user_id()))

INSERT / UPDATE / DELETE: user_has_org_access(organization_id)
```

### "Só vejo as minhas" é automático
A regra "usuário sem `view_all_opportunities` só enxerga oportunidades onde `owner_user_id = current_user_id()`" é aplicada pelo próprio RLS. **O frontend não precisa filtrar por `owner_user_id`** — o banco já filtra.

### Permission keys (snake_case em `permission_profiles.permissions`)
Nomes exatos, iguais aos usados em `usePermissions.ts`:

- `can_view_opportunities`
- `can_edit_opportunities`
- `can_delete_opportunities`
- `view_all_opportunities`
- `manage_assignments` (necessária para trocar `owner_user_id`)

No hook `usePermissions()` estão expostas em camelCase:
- `permissions.canViewOpportunities`
- `permissions.canEditOpportunities`
- `permissions.canDeleteOpportunities`
- `permissions.viewAllOpportunities`
- `permissions.manageAssignments`

Usar essas flags para esconder botões — o RLS já barra qualquer bypass.

---

## 4. Tela de lista

### RPCs disponíveis
- `get_opportunities_by_stage(p_organization_id uuid, p_limit_per_stage int)` — carrega N cards por coluna (usada pelo kanban web para primeira carga).
- `get_opportunity_stage_counts(org_id uuid)` — retorna `{stage_id, count, total_amount}`.

**Não existe** RPC dedicada de busca por texto. Buscar/pagina direto na tabela.

### Query direta para lista por estágio (padrão mobile)
```
supabase
  .from('opportunities')
  .select('id, title, amount, currency, status, close_date, pipeline_stage_id, owner_user_id, contact_id, contacts(full_name), users!owner_user_id(full_name)')
  .eq('organization_id', org.id)
  .eq('pipeline_stage_id', stageId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .range(from, to)
```

Batches de 50 (mesmo padrão do web).

### Filtros existentes no web (implementar conforme prioridade)
- **Estágio** — chips (obrigatório para o padrão mobile atual).
- **Responsável** — `owner_user_id`.
- **Status** — `open/won/lost`. Normalmente inferido pelo estágio, usado para abas "Ganhas/Perdidas".
- **Tags** — via `tag_assignments` (`entity_type='opportunity'`). Opcional no MVP.
- **Busca por título** — `ilike` em `title`.
- **Busca por contato** — join em `contacts.full_name` com `ilike`.

### Contadores no header do funil
Usar `get_opportunity_stage_counts(org_id)` para `count` + `total_amount` por etapa em uma única chamada.

---

## 5. Tela de detalhe — `/opportunities/:id`

Referência: `src/pages/opportunities/OpportunityDetail.tsx`.

### Seções
1. **Header** — título, valor, moeda, estágio atual, status, responsável.
2. **Ações rápidas** — mudar estágio, marcar Ganha/Perdida, editar, excluir (soft delete via `UPDATE ... SET deleted_at = now()`).
3. **Dados da oportunidade** — `close_date`, `source`, UTMs, `marketing_campaign_id` (read-only).
4. **Contato vinculado** — card com deep link para `/contacts/:id`.
5. **Empresa vinculada** — só se `organization.enable_companies_module`.
6. **Histórico de estágio** — `activities` com `related_type='opportunity' AND related_id=<id>`, tipo `stage_change`. Criadas automaticamente pelo trigger `create_stage_change_activity`.
7. **Atividades / tarefas** — `tasks` com `related_type='opportunity' AND related_id=<id>`.
8. **Notas** — mesmas `activities`, tipo `note` (inserção manual).

### Editáveis inline
- Estágio (bottom sheet / select) → dispara §7 se estágio for won/lost.
- Responsável (OwnerSelector) — requer `manage_assignments`.
- Ações Ganha/Perdida (atalho para mover para estágio won/lost).

Resto (title, amount, close_date, contact, company) via formulário completo — reusar os campos de `OpportunityDialog` como referência.

---

## 6. Criação / edição

### Obrigatórios (fonte: `OpportunityDialog.tsx`)
- `title`
- `pipeline_stage_id` — default: primeiro estágio (`order_index` menor).
- `organization_id` — automático (`organization.id`).
- `owner_user_id` — default: `userProfile.id` do usuário atual.
- `currency` — default: `organization.default_currency || 'BRL'`.

### Opcionais
- `amount` (default `0`)
- `contact_id`
- `company_id`
- `close_date`

Não enviar `status` — trigger deriva do estágio.

### Vínculo com contato
Não há RPC dedicada. Buscar direto:
```
supabase
  .from('contacts')
  .select('id, full_name')
  .eq('organization_id', org.id)
  .ilike('full_name', `%${q}%`)
  .order('full_name')
  .limit(20)
```

O web **não** cria contato novo dentro do dialog de oportunidade. **Recomendação mobile MVP**: manter esse padrão (obriga selecionar contato existente ou deixar sem vínculo). Se quiser criar na hora, reutilizar o fluxo já existente no módulo Contatos (`normalizePhoneBR` + duplicate check por telefone/email) para evitar duplicatas.

### Auditoria
- No INSERT: `created_by = userProfile.id`, `updated_by = userProfile.id`.
- No UPDATE: `updated_by = userProfile.id`. Nunca usar `auth.uid()` — a app inteira usa `users.id` interno.

---

## 7. Marcar como Ganha / Perdida

Fluxo confirmado em `CloseDatePromptDialog.tsx` + trigger de estágio.

### Regra
Ao mover a oportunidade para um estágio com `type='won'` ou `type='lost'`:
- Se `close_date` estiver vazio, **abrir prompt obrigatório** de data de fechamento (default = hoje).
- Sem `close_date`, a UX deve bloquear o salvamento.

### Update recomendado
```
UPDATE opportunities
   SET pipeline_stage_id = <estágio won/lost>,
       close_date = <data>,
       updated_by = <userProfile.id>
 WHERE id = <opp.id>
```
O trigger `trg_sync_opportunity_status_from_stage` cuida do `status`.

### Motivo de perda
**Não existe** `lost_reason` no schema. Não pedir. Registrar como "melhoria futura" no backlog.

### Efeitos colaterais automáticos (o mobile não precisa acionar)
Ao virar `won`, disparam:
- `trg_opportunity_won_promote_contact` — promove o contato a cliente.
- `trg_capi_purchase_on_opp_won` — evento Meta CAPI Purchase.
- `trg_emit_opportunity_won` — publica evento no outbox.
- `notify_opportunity_won` — cria notificação in-app.

---

## 8. Integração com telas já existentes no mobile

### Aba "Oportunidades" no detalhe de Contato
Hoje mostra "essa aba ainda não está disponível". Substituir por lista:
```
supabase
  .from('opportunities')
  .select('id, title, amount, currency, status, close_date, pipeline_stage_id, pipeline_stages(name, type)')
  .eq('organization_id', org.id)
  .eq('contact_id', contactId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
```
Ao tocar em um card → navegar para `/opportunities/:id`.
Botão "+" na aba → abrir criação com `contact_id` pré-preenchido.

### `opportunity-list-modal.tsx` do Dashboard
Hoje o tap num item cai num stub "em breve". Trocar por:
```
router.push(`/opportunities/${id}`)   // ou navigation.navigate('OpportunityDetail', { id })
```
conforme a stack de navegação usada no app.

### Rota canônica
`/opportunities/:id` — **mesma do web**. Não criar rota mobile-específica.

---

## 9. Notas operacionais

- **Soft delete**: sempre `.is('deleted_at', null)` em queries client-side (o RLS já filtra em SELECT direto, mas joins e RPCs podem não filtrar).
- **`created_by` / `updated_by`**: sempre `userProfile.id`, nunca `auth.uid()` — regra global do app.
- **Round-robin**: trigger `opportunities_round_robin` BEFORE INSERT atribui `owner_user_id` automaticamente se vier `NULL`. Enviar explícito quando o usuário escolher no OwnerSelector.
- **Currency**: usar `organization.default_currency` como default; não hardcodar `'BRL'` no mobile.
- **Realtime**: `opportunities` **não** está em `supabase_realtime` por padrão. Depender de:
  - refetch on-focus (quando a tela ganha foco);
  - pull-to-refresh na lista;
  - invalidação de cache React Query após mutação local.
- **Companies**: checar `organization.enable_companies_module` antes de mostrar seletor / card de empresa.
- **Limite de 1000 linhas** do PostgREST: ao paginar a lista, sempre usar `.range(from, to)` com batches ≤ 50.
