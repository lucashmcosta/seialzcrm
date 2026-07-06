
# Plano — docs/MOBILE_OPPORTUNITIES.md

Criar um único arquivo `docs/MOBILE_OPPORTUNITIES.md` (somente documentação, sem código/UI) cobrindo tudo que o app mobile precisa para implementar o módulo de Oportunidades. Baseado em inspeção direta do schema atual (`information_schema`, `pg_policies`, `pg_enum`), dos componentes web (`OpportunityDialog`, `CloseDatePromptDialog`, `OpportunitiesKanban`, `OpportunityDetail`, `MobileOpportunitiesKanban`) e do `usePermissions`.

## Estrutura do arquivo

### 1. Schema completo — `public.opportunities` (29 colunas)
Tabela com tipos, nullability, defaults e observações de uso. Colunas confirmadas hoje:

- **Identidade / tenancy**: `id uuid PK`, `organization_id uuid NOT NULL`, `created_at`, `updated_at`, `deleted_at` (soft-delete).
- **Negócio**: `title text NOT NULL`, `amount numeric default 0`, `currency text default 'BRL'`, `status opportunity_status default 'open'` (enum: `open | won | lost`), `close_date date`, `pipeline_stage_id uuid NOT NULL` (FK `pipeline_stages`), `is_sample bool default false`.
- **Vínculos**: `contact_id uuid` (nullable), `company_id uuid` (nullable — só usado quando `organization.enable_companies_module`), `owner_user_id uuid` (users.id interno, não auth.uid).
- **Auditoria**: `created_by uuid`, `updated_by uuid` (users.id).
- **Origem/atribuição**: `source text default 'manual'`, `source_external_id text`, `utm_source/medium/campaign/content/term text`, `attribution_data jsonb default '{}'`, `attribution_locked_at timestamptz`, `marketing_campaign_id uuid`.
- **IA/scoring** (read-only, populados por jobs): `health_score int`, `ghosting_risk_score int`.
- **Não existe hoje**: `probability`, `lost_reason`, `pipeline_id` (o "pipeline" hoje é implícito — todos os `pipeline_stages` da org formam um único funil). Deixar registrado como "não implementar no mobile".

### 2. Pipeline e estágios
- Tabela `public.pipeline_stages` — colunas: `id, organization_id, name, order_index int NOT NULL, type pipeline_stage_type` (enum: `custom | won | lost`), `created_at`, `updated_at`.
- Não há tabela `pipelines` — é um único funil por org, ordenado por `order_index`.
- Regra de sincronização (trigger `trg_sync_opportunity_status_from_stage`): mover para estágio `type='won'` → status vira `won`; `type='lost'` → `lost`; `custom` → `open`. Então **mudar de estágio já muda o status automaticamente** — não enviar `status` no update, só `pipeline_stage_id`.
- Kanban web tem drag-and-drop entre colunas. **Recomendação para mobile**: replicar o padrão já existente em `MobileOpportunitiesKanban.tsx` — chips horizontais de estágios + lista vertical de cards do estágio ativo (sem drag). Mudança de estágio via bottom sheet / menu no card.

### 3. RLS e permissões
- Policies em `opportunities`:
  - SELECT: `is_admin_user() OR (organization_id = ANY(current_user_org_ids()) AND deleted_at IS NULL AND (user_can_view_all(organization_id,'opportunities') OR owner_user_id = current_user_id()))`.
  - INSERT/UPDATE/DELETE: `user_has_org_access(organization_id)`.
- Regra "só vejo as minhas" **existe e é automática** via RLS quando o perfil não tem `view_all_opportunities`. O frontend não precisa filtrar por `owner_user_id`.
- Permission keys em `permission_profiles.permissions` (snake_case, exatamente como usado em `usePermissions.ts`):
  - `can_view_opportunities`
  - `can_edit_opportunities`
  - `can_delete_opportunities`
  - `view_all_opportunities`
  - (também relevantes para atribuir: `manage_assignments`)
- No mobile, importar `usePermissions()` e usar `permissions.canViewOpportunities / canEditOpportunities / canDeleteOpportunities / viewAllOpportunities`.

### 4. Tela de lista
- Não existe RPC dedicada de busca. Existe `get_opportunities_by_stage(p_organization_id, p_limit_per_stage)` e `get_opportunity_stage_counts(org_id)` — usadas pelo kanban web para carga inicial em batches por coluna.
- Para lista mobile por estágio: query direta `supabase.from('opportunities').select(..., contacts(full_name), users!owner_user_id(full_name)).eq('organization_id',...).eq('pipeline_stage_id', stageId).is('deleted_at', null).order('created_at', {ascending:false}).range(...)`.
- Filtros disponíveis no web (a replicar conforme prioridade):
  - estágio (chips)
  - responsável (`owner_user_id`)
  - status (`open/won/lost`) — normalmente inferido pelo estágio, mas usado para abas "Ganhas/Perdidas"
  - tags via `tag_assignments` (opcional)
  - busca por título (`ilike`) e por nome de contato (join)
- Contadores por estágio: `get_opportunity_stage_counts(org_id)` retorna `{stage_id, count, total_amount}`.

### 5. Tela de detalhe (`/opportunities/:id`)
Seções que o web mostra (referência `OpportunityDetail.tsx`):
- **Header**: título, valor, moeda, estágio atual, status, responsável.
- **Ações rápidas**: mudar estágio, marcar Ganha/Perdida, editar, excluir (soft delete).
- **Dados da oportunidade**: `close_date`, `source`, UTMs, `marketing_campaign_id` (read-only).
- **Contato vinculado**: card com link para `/contacts/:id`.
- **Empresa vinculada** (se `enable_companies_module`).
- **Histórico de estágio**: lê `activities` filtradas por `related_type='opportunity'` (trigger `create_stage_change_activity` cria automaticamente).
- **Atividades/tarefas**: `tasks` com `related_type='opportunity' AND related_id=<id>`.
- **Notas**: mesmas activities (tipo `note`).

Editáveis inline: estágio (via bottom sheet/select), responsável (OwnerSelector), status (via ações Ganha/Perdida). Restante via formulário completo (reusar `OpportunityDialog` como referência de campos).

### 6. Criação / edição
Campos obrigatórios (do `OpportunityDialog`):
- `title` (obrigatório)
- `pipeline_stage_id` (obrigatório — default primeiro estágio)
- `organization_id` (auto)
- `owner_user_id` (default = `userProfile.id` do usuário atual)
- `currency` (default = `organization.default_currency || 'BRL'`)

Opcionais: `amount`, `contact_id`, `company_id`, `close_date`.

Vínculo com contato:
- Busca em `contacts` filtrada por org, ordem por `full_name`. Não há RPC específica — usar `supabase.from('contacts').select('id, full_name').eq('organization_id', org.id).ilike('full_name', %q%).limit(20)`.
- Web hoje **não** cria contato novo no dialog de oportunidade. **Recomendação mobile**: manter esse padrão para MVP; se quiser criar novo, reutilizar o fluxo/dedupe já existente em `MobileContactsList` (mesmo `normalizePhoneBR` + duplicate check).

### 7. Marcar como Ganha / Perdida
Fluxo confirmado (`CloseDatePromptDialog.tsx` + trigger de stage):
- Ao mover para estágio `type='won'` ou `type='lost'`, se `close_date` estiver vazio, abrir prompt obrigatório de data de fechamento (default hoje). Sem `close_date` a UX bloqueia.
- **Não existe** `lost_reason` no schema — não pedir motivo. Registrar como "futura melhoria".
- Preferir atualizar apenas `pipeline_stage_id` (+ `close_date`) — o trigger cuida do `status`. Enviar `status` manualmente é redundante e pode conflitar.
- Triggers laterais que disparam automaticamente ao ganhar (o mobile não precisa acionar nada): `trg_opportunity_won_promote_contact`, `trg_capi_purchase_on_opp_won`, `trg_emit_opportunity_won_event`, `notify_opportunity_won`.

### 8. Pontos de integração no app mobile existente
- **Aba "Oportunidades" no detalhe de Contato** (hoje mostra "não está disponível"): passar a listar `opportunities.eq('contact_id', contactId).is('deleted_at', null).order('created_at', {ascending:false})` e navegar para `/opportunities/:id` ao tocar.
- **`opportunity-list-modal.tsx` do Dashboard** (stub "em breve" no tap do item): trocar o stub por `navigation.navigate('OpportunityDetail', { id })` / `router.push('/opportunities/:id')` conforme stack de navegação usada.
- **Rota canônica**: `/opportunities/:id` (mesma do web — não criar rota mobile-específica).

### 9. Notas operacionais
- Sempre filtrar `deleted_at IS NULL` (RLS já filtra em SELECT, mas necessário em joins/paginação client-side).
- Nunca setar `created_by/updated_by` com `auth.uid()` — usar `userProfile.id`.
- Round-robin: existe trigger `opportunities_round_robin` BEFORE INSERT — se `owner_user_id` for `NULL`, o BD atribui automaticamente. Passar `owner_user_id` explícito quando o usuário escolher.
- Realtime: `opportunities` não está no `supabase_realtime` por padrão — depender de refetch on-focus/pull-to-refresh no mobile.

## Entregável
Um único arquivo: `docs/MOBILE_OPPORTUNITIES.md` com as 9 seções acima, em português, formatado em Markdown, sem código de UI — apenas schema, tipos, enums, permission keys, regras de trigger, RPCs e fluxos.
