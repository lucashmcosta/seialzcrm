# Seialz — Módulo de Contatos para o app mobile (React Native / Expo)

Documento único de referência para implementar o módulo **Contatos** no app mobile, consumindo o **mesmo** Supabase do CRM web. Mesmo formato de `docs/mobile/backend-reference.md` e `docs/mobile/dashboard-spec.md`.

**Fonte da verdade:** este repo web. Se algo aqui divergir de `src/`, o repo web ganha. Consultar também:

- `docs/mobile/backend-reference.md` — auth, RLS, cliente Supabase no Expo.
- `docs/mobile/dashboard-spec.md` — padrão de tela mobile.
- `docs/modules/contacts/README.md` + `data-model.md`.
- `docs/decisions/0001-multi-tenancy-organization-id.md`.

Uncertainties são marcadas `[INCERTO]`; pendências, `[TODO]`.

---

## 1. Escopo mobile v1

**Entra no v1**

- Listagem paginada com busca e filtros (lifecycle stage, dono, período).
- Detalhe do contato: dados pessoais, docs legais (BR), endereço, atribuição, marketing/CTWA, atividades, oportunidades, tarefas, notas, conversas (WhatsApp), anexos, documentos.
- Criação e edição via form único (`ContactForm`).
- Edição inline: `owner_user_id` (via `OwnerSelector`).
- Soft-delete (`deleted_at`).
- Checagem de duplicidade por e-mail/telefone com bloqueio quando `duplicate_enforce_block = true` ou colisão no índice único `(organization_id, phone_normalized)`.

**Fora do v1** (implementar depois)

- Merge/unificação manual de contatos duplicados (`contacts_merge_log`).
- CRUD completo de `communication_endpoints` do contato — no v1 apenas leitura via threads.
- Custom fields (`custom_field_definitions` / `custom_field_values`) — só leitura.
- Import de CSV/planilha.
- Column selector, saved views, bulk actions do desktop.

---

## 2. Multi-tenancy e RLS (o que o mobile precisa saber)

Padrão do projeto (ADR 0001):

- Toda tabela carrega `organization_id`.
- Cliente **nunca** usa `auth.uid()` para relacionamentos. `owner_user_id`, `created_by`, `updated_by` recebem `users.id` (chamado `userProfile.id` no código).
- RLS já filtra por organização com `organization_id = ANY(current_user_org_ids())`. O app **não** precisa (nem deve) adicionar `.eq('organization_id', ...)` para segurança — só para performance/clareza (o web faz isso).

### 2.1 Policy chave em `contacts` (SELECT)

```
is_admin_user()
OR (
  organization_id = ANY(current_user_org_ids())
  AND deleted_at IS NULL
  AND (
    user_can_view_all(organization_id, 'contacts')
    OR owner_user_id = current_user_id()
  )
)
```

**Isso responde à pergunta sobre `viewAllContacts`:** o filtro é feito no **banco**, não no cliente. Diferente do padrão que você adotou em Oportunidades, no módulo Contatos o app mobile **não precisa** ler `permissions.view_all_contacts` para filtrar a listagem — a RLS já esconde contatos de outros donos quando o perfil de permissão do usuário não tem `view_all_contacts`. O client-side `permissions.viewAllContacts` (`src/hooks/usePermissions.ts`) só é usado para decidir se mostra o **filtro** "Responsável" na UI (código: `ContactsList.tsx:516`).

Recomendação mobile: espelhar essa regra — mostrar chip/dropdown de responsável **apenas** quando `permissions.viewAllContacts === true`.

### 2.2 Policies das tabelas relacionadas

| Tabela | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `contacts` | ver 2.1 (+ policy separada para lixeira `deleted_at IS NOT NULL`) | `user_has_org_access(organization_id)` |
| `companies` | `user_has_org_access(organization_id) AND deleted_at IS NULL` | `user_has_org_access(organization_id)` |
| `communication_endpoints` | `organization_id = ANY(current_user_org_ids())` | apenas `is_org_admin(organization_id)` |
| `tags` | `user_has_org_access(organization_id)` (policy `ALL`) | mesma |
| `tag_assignments` | `user_has_org_access(organization_id)` (policy `ALL`) | mesma |

⚠️ **`communication_endpoints`**: escrita é bloqueada para não-admins. Mobile v1 apenas lê.

---

## 3. Schema

Colunas extraídas de `information_schema.columns` em 2026-07-06. Legenda: `NN` = NOT NULL; `dflt` = default.

### 3.1 `contacts` (61 colunas)

| coluna | tipo | NN | dflt | observação |
|---|---|---|---|---|
| id | uuid | ✓ | `gen_random_uuid()` | PK |
| organization_id | uuid | ✓ | — | tenant |
| full_name | text | ✓ | — | **único NOT NULL de negócio** |
| first_name | text |  | — | |
| last_name | text |  | — | |
| email | text |  | — | usado em duplicate check |
| phone | text |  | — | E.164 desejável; ver `phone_normalized` |
| company_name | text |  | — | denormalizado; usar quando `enable_companies_module = false` |
| company_id | uuid |  | — | FK `companies.id` |
| owner_user_id | uuid |  | — | **FK `users.id`**, nunca `auth.users.id` |
| lifecycle_stage | enum `lifecycle_stage` |  | `'lead'` | valores: `lead`, `customer`, `inactive` |
| do_not_contact | boolean |  | `false` | bloqueia envio |
| is_sample | boolean |  | `false` | dado de exemplo |
| deleted_at | timestamptz |  | — | soft-delete |
| created_at | timestamptz |  | `now()` | |
| updated_at | timestamptz |  | `now()` | |
| source | text |  | — | ex.: `manual`, `meta_lead_ads`, `kommo` |
| source_external_id | text |  | — | id no sistema origem |
| created_by | uuid |  | — | FK `users.id` |
| updated_by | uuid |  | — | FK `users.id` |
| **Docs legais (BR)** | | | | |
| cpf | text |  | — | sem máscara canônica no schema |
| rg | text |  | — | |
| rg_issuer | text |  | — | ex.: `SSP/SP` |
| nationality | text |  | — | |
| **Endereço** | | | | |
| address_street | text |  | — | rua + número |
| address_neighborhood | text |  | — | |
| address_city | text |  | — | |
| address_state | text |  | — | UF (2 letras) |
| address_zip | text |  | — | |
| **Marketing / atribuição** | | | | |
| marketing_campaign_id | uuid |  | — | FK `marketing_campaigns.id` |
| utm_source, utm_medium, utm_campaign, utm_content, utm_term | text |  | — | |
| fbclid | text |  | — | |
| fbclid_captured_at | timestamptz |  | — | |
| gclid | text |  | — | |
| landing_url | text |  | — | |
| referrer_url | text |  | — | |
| client_ip_address | inet |  | — | |
| client_user_agent | text |  | — | |
| attribution_path | text[] | ✓ | `'{}'` | histórico |
| meta_lead_id, meta_adset_id, meta_campaign_id, meta_ad_id | text |  | — | Meta Lead Ads / CTWA |
| **CTWA (Click-to-WhatsApp)** | | | | |
| ad_referral_source_url | text |  | — | |
| ad_referral_headline | text |  | — | |
| ad_referral_body | text |  | — | |
| ad_referral_media_url | text |  | — | thumb do anúncio |
| ad_referral_source_id | text |  | — | Meta Ad ID |
| ad_referral_source_type | text |  | — | `ad`, `post`, etc. |
| ad_referral_captured_at | timestamptz |  | — | |
| ad_referral_ctwa_clid | text |  | — | click id CTWA |
| **Derivadas (não editar)** | | | | |
| phone_normalized | text |  | — | preenchido por trigger `trg_contacts_normalize_phone` (função `normalize_phone_br`). Índice único `(organization_id, phone_normalized)` — colisão retorna `23505`. |
| phone_digits | text |  | — | só dígitos, para busca por telefone |
| search_name | text |  | — | `f_unaccent(lower(full_name))` — usar em `.ilike` |
| search_email | text |  | — | idem para e-mail |
| engagement_score | integer |  | — | preenchido por jobs |
| avg_response_time_seconds | integer |  | — | idem |

**Regra prática mobile:** ao gravar, **nunca** setar `phone_normalized`, `phone_digits`, `search_name`, `search_email`, `attribution_path`, `engagement_score`, `avg_response_time_seconds` — são derivados por trigger/job.

### 3.2 `companies` (11 colunas)

| coluna | tipo | NN | dflt |
|---|---|---|---|
| id | uuid | ✓ | `gen_random_uuid()` |
| organization_id | uuid | ✓ | — |
| name | text | ✓ | — |
| domain | text |  | — |
| phone | text |  | — |
| address | text |  | — |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |
| deleted_at | timestamptz |  | — |
| source | text |  | — |
| source_external_id | text |  | — |

Relação: `contacts.company_id → companies.id`. Só usar quando `organization.enable_companies_module = true` (o form web faz esse gate, ver `ContactForm.tsx:90-108`).

### 3.3 `communication_endpoints` (22 colunas)

Endpoints são do **nível da organização** (não do contato) — representam número WhatsApp/Twilio, email de suporte, etc. O vínculo canal↔contato existe via `message_threads.contact_id + primary_endpoint_id`.

| coluna | tipo | NN | dflt |
|---|---|---|---|
| id | uuid | ✓ | `gen_random_uuid()` |
| organization_id | uuid | ✓ | — |
| organization_integration_id | uuid |  | — |
| channel | text | ✓ | — | `whatsapp`, `email`, `voice`, ... |
| provider | text | ✓ | `'twilio'` | `twilio`, `meta`, `kommo`, ... |
| external_account_id | text |  | — |
| sender_sid | text |  | — |
| external_address | text |  | — | número/e-mail do endpoint |
| display_name | text |  | — |
| default_context_type | text | ✓ | `'unknown'` |
| purpose | text | ✓ | `'other'` | `sales`, `customer_service`, `other` |
| status | text | ✓ | `'unknown'` | `online`, `offline`, `unknown`, ... |
| is_active | boolean | ✓ | `true` |
| coexistence_enabled | boolean | ✓ | `false` |
| assigned_user_id | uuid |  | — | FK `users.id` |
| quality_rating | text |  | — |
| current_tier | integer |  | — |
| messaging_limit_per_24h | integer |  | — |
| inbound_settings | jsonb |  | — |
| metadata | jsonb | ✓ | `'{}'` |
| created_at | timestamptz | ✓ | `now()` |
| updated_at | timestamptz | ✓ | `now()` |

Mobile v1: **apenas SELECT**. Escrita só admin.

### 3.4 `tags` (6) e `tag_assignments` (6)

`tags`:

| coluna | tipo | NN | dflt |
|---|---|---|---|
| id | uuid | ✓ | `gen_random_uuid()` |
| organization_id | uuid | ✓ | — |
| name | text | ✓ | — |
| color | text |  | `'#6366f1'` |
| created_at | timestamptz |  | `now()` |
| updated_at | timestamptz |  | `now()` |

`tag_assignments`:

| coluna | tipo | NN | dflt |
|---|---|---|---|
| id | uuid | ✓ | `gen_random_uuid()` |
| organization_id | uuid | ✓ | — |
| tag_id | uuid | ✓ | — |
| entity_type | text | ✓ | — | usar `'contact'` |
| entity_id | uuid | ✓ | — | `contacts.id` |
| created_at | timestamptz |  | `now()` |

Sem `UNIQUE (tag_id, entity_id)` explícito no schema → prevenir duplicatas no cliente antes de inserir. `[INCERTO]` se existe índice único a nível de banco — verificar antes de habilitar toggle.

### 3.5 `custom_field_definitions` (12) e `custom_field_values` (8)

Suporte parcial no v1 mobile (leitura).

`custom_field_definitions`: `id, organization_id, module (NN, usar 'contact'), name (NN), label (NN), field_type (NN), options (jsonb), is_required (default false), order_index (NN default 0), created_at, updated_at, source_external_id`.

`custom_field_values`: `id, organization_id, module (NN), record_id (NN = contacts.id), field_definition_id (NN), value (jsonb), created_at, updated_at`.

### 3.6 `organizations` — flags relevantes

| coluna | tipo | valores | efeito no mobile |
|---|---|---|---|
| `duplicate_check_mode` | enum | `none`, `email`, `phone`, `email_or_phone` (default `email`) | quais campos verificar antes de salvar |
| `duplicate_enforce_block` | boolean (default `false`) | `true`/`false` | se `true`, bloqueia o save; se `false`, apenas avisa |
| `enable_companies_module` | boolean | — | se `false`, campo empresa é texto livre em `company_name` |
| `round_robin_enabled` | boolean (default `false`) | — | trigger `contacts_round_robin` reatribui `owner_user_id` em INSERT |

⚠️ Colunas `view_all_contacts` e `default_owner_user_id` **não existem** em `organizations` — visibilidade "ver todos" fica em `permission_profiles.permissions.view_all_contacts` (por usuário, via `usePermissions`).

### 3.7 Triggers em `contacts` que o mobile deve conhecer

- `trg_contacts_normalize_phone` (BEFORE INS/UPD): preenche `phone_normalized` via `normalize_phone_br(phone)`.
- `contacts_round_robin` (BEFORE INS): reatribui `owner_user_id` quando round-robin ativo.
- `trg_capi_lead_on_contact_insert/update`: dispara Meta CAPI.
- `trg_populate_contact_marketing_campaign_fk`: liga `marketing_campaign_id` a partir de UTMs.
- `trg_publish_event_contacts`: publica evento no outbox.
- `update_contacts_updated_at`: mantém `updated_at`.
- ⚠️ auditoria duplicada (drift P0 #1) — não é problema do mobile, só saber que cada INS/UPD/DEL vai gerar 2 linhas em `audit_logs`.

---

## 4. Tela de listagem — `MobileContactsList`

### 4.1 Paginação

Web usa RPC `rpc_search_contacts` com **offset**:

```
p_organization_id  uuid            -- obrigatório
p_search           text  DEFAULT NULL
p_owner_user_id    uuid  DEFAULT NULL
p_lifecycle_stage  text  DEFAULT NULL
p_created_from     timestamptz DEFAULT NULL
p_created_to       timestamptz DEFAULT NULL
p_limit            int   DEFAULT 50
p_offset           int   DEFAULT 0
```

Retorna: `TABLE(id, full_name, email, phone, company_name, lifecycle_stage, owner_user_id, created_at, total_count bigint)` — `total_count` vem em cada linha, permite mostrar contador sem query extra.

**Mobile:** infinite scroll via `IntersectionObserver` já implementado em `MobileContactsList` (offset + append). Página inicial 25–50. `mobileHasMore = mobileContacts.length < totalCount`.

### 4.2 Campos no card

Já implementados hoje em `MobileContactsList.tsx`:

- Avatar (iniciais de `full_name`).
- Nome (`full_name`).
- Telefone formatado via `formatPhoneDisplay(phone)`.
- E-mail (quando presente).
- Empresa (`company_name`).
- Badge de lifecycle com dot color (map: lead=blue, qualified=purple, opportunity=warning, customer=success, churned=error, inactive=gray).

Não implementado ainda: tags, dono. Adicionar como opcional em v1.1.

### 4.3 Filtros e ordenação

- **Busca** (`p_search`): a RPC decide internamente entre modo telefone (só `phone_digits`) e modo texto (`search_name` + `search_email`). O código web tem a lógica espelhada em JS (`applySearchFilters`) apenas para o "selecionar todos" — para a listagem paginada usa-se **só** a RPC.
- **Owner**: dropdown de responsáveis vindos de `user_organizations` filtrado por `is_active`. Só mostrar quando `permissions.viewAllContacts`.
- **Lifecycle**: chips `lead | customer | inactive` (enum tem só esses 3 valores, apesar do map de cores prever mais).
- **Data de criação**: `p_created_from` + `p_created_to` (o web adiciona `T23:59:59.999Z` ao "to").
- **Ordenação**: web ordena client-side por coluna (`created_at desc` default). Mobile: manter `created_at desc` fixo em v1.

### 4.4 Estado "vazio" e loading

- Skeleton na primeira carga.
- Spinner pequeno no rodapé durante `loadingMore`.
- Mensagem "Nenhum contato encontrado" (i18n `contacts.noContacts`).

### 4.5 FAB "Novo contato"

Só quando `permissions.canEditContacts === true`. Navega para `/contacts/new`.

---

## 5. Tela de detalhe — `ContactDetail`

### 5.1 Query principal

```ts
supabase.from('contacts').select('*')
  .eq('id', id)
  .eq('organization_id', organization.id)
  .maybeSingle();
```

Enriquecimento:

- `marketing_campaigns` (por `marketing_campaign_id`) → nome do anúncio no header.
- `users` (por `created_by`, `updated_by`) → nomes de auditoria.

### 5.2 Seções do detalhe (mobile)

Espelhar o layout mobile atual (`ContactDetail.tsx:171-281`):

1. **Header**: avatar XL, nome, badge lifecycle, `LeadOriginBadge` (CTWA/UTM), botões Mensagens / Ligar / Email / Mais.
2. **Contato**: e-mail (mailto), telefone (formatado, click-to-call se `hasVoiceIntegration`), empresa, responsável (inline com `OwnerSelector`).
3. **Documentos**: CPF, RG + emissor.
4. **Endereço**: rua, bairro, cidade/UF, CEP.
5. **Origem do Anúncio (CTWA)**: exibir se `ad_referral_source_id` existir (headline, body, ad_id, media_url, captured_at, link).
6. **Atribuição de Marketing**: exibir se qualquer UTM/click id existir.

### 5.3 Tabs (drawer horizontal no mobile)

Já implementadas via `useState<Key>` com scroll horizontal (`ContactDetail.tsx:418-433`):

| tab | componente | query base |
|---|---|---|
| `details` | inline (ver 5.2) | — |
| `timeline` | `<ActivityTimeline contactId>` | `activities.contact_id = id` |
| `opportunities` | `<ContactOpportunities contactId>` | `opportunities.contact_id = id` |
| `tasks` | `<ContactTasks contactId>` | `tasks.contact_id = id` |
| `notes` | `<ContactNotes contactId>` | subset de `activities` type=note `[INCERTO]` |
| `calls` | `<ContactCalls contactId contactPhone contactName>` | `calls.contact_id = id` |
| `messages` (só desktop) | `<ContactConversations contactId>` | ver 5.4 |
| `attachments` | `<ContactAttachments contactId>` | `attachments.contact_id = id` |
| `documents` | `<DocumentChecklist contactId>` | `document_submissions.contact_id = id` |

No mobile a tab `messages` é substituída pelo botão "Mensagens" no header, que navega para `/messages?contact=<id>` (fullscreen chat).

### 5.4 Conversas do contato

Hook `useContactConversationsByContext(contactId)` (código completo em §9.4) retorna **uma** thread por `business_context`:

```ts
{ sales: ContextThreadRow | null, customer_service: ContextThreadRow | null }
```

Regra determinística de escolha (para lidar com duplicatas):

1. Maior `real_message_count` (mensagens reais, não notas internas).
2. Empate → maior `last_real_message_at`.
3. Empate final → menor `created_at`.

Enriquece com `communication_endpoints` (endpoint primário) e `users.full_name` (responsável). Threads vazias nunca vencem threads com mensagens.

### 5.5 Edição inline

Feito hoje **apenas** para responsável (`owner_user_id` via `OwnerSelector`). Payload:

```ts
supabase.from('contacts')
  .update({ owner_user_id, updated_by: userProfile.id })
  .eq('id', contact.id)
```

Demais campos exigem tela de edição (`/contacts/:id/edit` → `ContactForm`).

### 5.6 Soft-delete

```ts
supabase.from('contacts')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', contact.id)
```

Não deletar registros filhos — trigger de propagação cuida de oportunidades órfãs (ver memory `Contact Soft Delete`).

---

## 6. Criação / edição — `ContactForm`

### 6.1 Campos e obrigatoriedade

**Obrigatório no banco**: apenas `full_name` (além de `organization_id`, tratado pelo cliente).

**Obrigatório no form web** (`ContactForm.tsx`): `full_name`. Todos os demais são opcionais.

**Payload mínimo:**

```ts
{
  organization_id: organization.id,
  full_name: '...',
  owner_user_id: formData.owner_user_id || userProfile.id,  // fallback = usuário atual
  created_by: userProfile.id,   // no INSERT
  updated_by: userProfile.id,   // no UPDATE
  lifecycle_stage: 'lead',      // enum: lead | customer | inactive
}
```

### 6.2 Duplicate check (regra completa)

```
mode = organization.duplicate_check_mode  // none | email | phone | email_or_phone
block = organization.duplicate_enforce_block  // boolean
```

**Fluxo (`ContactForm.tsx:145-247`):**

1. Se `mode = none` → não checa nada da regra da org.
2. Se `mode = email` e `formData.email` → busca `contacts.email = formData.email`.
3. Se `mode = phone` e `formData.phone` → busca `contacts.phone_normalized = normalizePhoneBR(formData.phone)`.
4. Se `mode = email_or_phone` → faz ambas checagens acima.
5. **Sempre**, independente do mode: checa `phone_normalized` (existe `UNIQUE (organization_id, phone_normalized)` no banco).
6. Se editar (`isEdit`), aplicar `.neq('id', currentId)` em todas as queries.
7. Se encontrou duplicatas:
   - Duplicata de **telefone** é **sempre bloqueante** (índice único do banco retornaria `23505`).
   - Duplicata de e-mail bloqueia se `duplicate_enforce_block = true`, senão mostra warning + botão "Salvar mesmo assim" (`handleForceSave`).
8. Se der `23505` no INSERT/UPDATE (race), tratar em `handleDbError`: reconsulta o telefone, mostra as duplicatas e toast de erro.

### 6.3 Validações client-side

- **Telefone**: `PhoneInput` (`src/components/ui/phone-input.tsx`) devolve E.164. Para checagem de duplicidade usar `normalizePhoneBR` (porta TS de `public.normalize_phone_br` — código completo em §9.3). Trata 9º dígito BR (celulares antigos sem "9").
- **CPF / RG**: **não há helper no repo** (`rg -n "cpf|CPF" src/lib/ src/hooks/` retornou vazio). Hoje o form aceita texto livre. `[TODO]` no v1 mobile: adicionar máscara + `validate-br` (ou porta manual) se o negócio exigir. **Não** inventar validação sem alinhar.
- **E-mail**: `<input type="email">`, sem validação extra.
- **CEP**: texto livre com placeholder `00000-000`. Sem auto-preenchimento por ViaCEP hoje.

---

## 7. Hooks a implementar no mobile (espelho do web)

O web não tem hooks React Query dedicados a Contacts — usa `useState + supabase.rpc` direto na página (`ContactsList.tsx`). Para o mobile, sugestão de hooks React Query:

```ts
// Lista paginada via RPC
useContactsList({ search, ownerId, stage, from, to, limit, offset })
// → { data: Contact[]; total: number; hasMore: boolean }

// Detalhe
useContact(id)   // select * + campaign + created_by/updated_by names

// Mutations
useContactMutations()
//   .createContact(payload)
//   .updateContact(id, payload)
//   .softDeleteContact(id)
//   .updateOwner(id, userId)

// Relações
useContactOpportunities(id)   // opportunities.contact_id = id
useContactTasks(id)           // tasks.contact_id = id
useContactActivities(id)      // activities.contact_id = id
useContactCalls(id)           // calls.contact_id = id
useContactAttachments(id)     // attachments.contact_id = id
useContactConversationsByContext(id)  // já existe (§9.4) — copiar como está

// Duplicate check (chamado dentro de createContact/updateContact)
useDuplicateCheck({ email, phone, excludeId })
```

Invalidação sugerida após mutation:

- `create` / `update` / `delete` → invalidar `['contacts', 'list']` + `['contact', id]`.
- `updateOwner` → invalidar `['contact', id]` + otimista no card.

---

## 8. Checklist de implementação mobile

1. Copiar `normalizePhoneBR` para `mobile/lib/phoneUtils.ts` (§9.3).
2. Criar `useContactsList` que chama `rpc_search_contacts`.
3. Tela `ContactsScreen`: replicar `MobileContactsList` (§9.5) trocando `react-router` por `expo-router` e `Input` por `TextInput`.
4. Tela `ContactDetailScreen`: header + tabs horizontais (Native `ScrollView horizontal`).
5. Tela `ContactFormScreen`: espelho de `ContactForm` (§9.2), sem `PhoneInput` do web — usar equivalente RN. Duplicate check antes do INSERT/UPDATE.
6. Reaproveitar `useContactConversationsByContext` (§9.4) para exibir os cards Sales / Customer Service no detalhe.
7. Lidar com `23505` no catch da mutation (telefone duplicado).
8. Bloquear FAB e ação "Editar" quando `!permissions.canEditContacts`.
9. Bloquear Excluir quando `!permissions.canDeleteContacts`.
10. Nunca escrever em `communication_endpoints` (RLS bloqueia não-admin).

---

## 9. Código de referência (colado integralmente)


### 9.1 `src/pages/contacts/ContactsList.tsx`

```tsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { Link, useNavigate } from 'react-router-dom';
import type { SortDescriptor } from 'react-aria-components';
import { PencilSimple, TrashSimple } from '@phosphor-icons/react';
import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { MobileContactsList } from '@/components/mobile/MobileContactsList';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/base/buttons/button';
import { Button as ShadButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Plus, MagnifyingGlass, FunnelSimple } from '@phosphor-icons/react';
import { SavedViewsDropdown } from '@/components/SavedViewsDropdown';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { Breadcrumbs } from '@/components/application/breadcrumbs/breadcrumbs';
import { PaginationWithPageSize } from '@/components/application/pagination/pagination';
import { PaginationPageMinimalCenter } from '@/components/application/pagination/pagination';
import {
  Table,
  TableCard,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableColumn,
  TableCheckboxHeader,
  TableCheckboxCell,
  TableRowActionsDropdown,
  TableRowAction,
} from '@/components/application/table/table';
import { ColumnSelector, type ColumnConfig } from '@/components/application/table/column-selector';
import { Avatar } from '@/components/base/avatar/avatar';
import { BadgeWithDot } from '@/components/base/badges/badges';
import type { BadgeColor } from '@/components/base/badges/badge-types';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  lifecycle_stage: string;
  owner_user_id: string | null;
  created_at: string;
}

const DEFAULT_ITEMS_PER_PAGE = 25;

const lifecycleColors: Record<string, BadgeColor> = {
  lead: 'blue',
  qualified: 'purple',
  opportunity: 'warning',
  customer: 'success',
  churned: 'error',
  inactive: 'gray',
};

export default function ContactsList() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { permissions } = usePermissions();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const loading = initialLoading; // for mobile prop compat
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Debounce search input (250ms). Page reset for search change is handled
  // inline inside fetchContacts to avoid the cascade
  //   debouncedSearch → setCurrentPage(1) → second fetch.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Normalize a term for search: lower-case + strip diacritics (Unicode-safe).
  // Matches DB column `search_name` = f_unaccent(lower(full_name)).
  const normalizeTerm = (s: string): string =>
    s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

  // Extract only digits from a term (matches DB column `phone_digits`).
  const onlyDigits = (s: string): string => s.replace(/\D/g, '');

  // Detect "phone-like" terms: mostly digits + optional +, spaces, dashes, parens.
  // For those we search ONLY phone_digits (avoids OR against search_name/email
  // that the planner still has to filter row-by-row).
  const isPhoneLikeTerm = (s: string): boolean => /^[\d\s()+\-]+$/.test(s) && onlyDigits(s).length >= 4;

  // Build search filters. Two modes:
  //   phone mode → single `phone_digits.ilike.%digits%` filter.
  //   text mode  → per-token OR across (search_name, search_email), ANDed.
  const applySearchFilters = <T extends { or: (q: string) => T; ilike: (col: string, pattern: string) => T }>(
    query: T,
    term: string,
  ): T => {
    if (isPhoneLikeTerm(term)) {
      const digits = onlyDigits(term);
      return query.ilike('phone_digits', `%${digits}%`);
    }
    const tokens = term.split(/\s+/).filter(Boolean);
    let q = query;
    for (const raw of tokens) {
      const safe = raw.replace(/[,()]/g, ' ').trim();
      if (!safe) continue;
      const nTerm = normalizeTerm(safe);
      if (!nTerm) continue;
      q = q.or(`search_name.ilike.%${nTerm}%,search_email.ilike.%${nTerm}%`);
    }
    return q;
  };
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  
  // Filters state (persisted per user/org)
  const [ownerFilter, setOwnerFilter, , ownerHydrated] = usePersistedFilters<string>('contacts.ownerFilter', 'all');
  const [stageFilter, setStageFilter, , stageHydrated] = usePersistedFilters<string>('contacts.stageFilter', 'all');
  const [createdFromFilter, setCreatedFromFilter, , fromHydrated] = usePersistedFilters<string>('contacts.createdFromFilter', '');
  const [createdToFilter, setCreatedToFilter, , toHydrated] = usePersistedFilters<string>('contacts.createdToFilter', '');
  const [showFilters, setShowFilters] = useState(false);

  const filtersHydrated = ownerHydrated && stageHydrated && fromHydrated && toHydrated;

  const activeFiltersCount = [
    ownerFilter !== 'all',
    stageFilter !== 'all',
    createdFromFilter,
    createdToFilter,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setOwnerFilter('all');
    setStageFilter('all');
    setCreatedFromFilter('');
    setCreatedToFilter('');
  };
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage, , itemsPerPageHydrated] = usePersistedFilters<number>('contacts.itemsPerPage', DEFAULT_ITEMS_PER_PAGE);

  // Mobile infinite scroll state
  const [mobileContacts, setMobileContacts] = useState<Contact[]>([]);
  const [mobileLoadingMore, setMobileLoadingMore] = useState(false);
  
  // Select all mode
  const [selectAllMode, setSelectAllMode] = useState<'page' | 'all' | 'none'>('none');
  
  // Sorting state (persisted)
  const [sortDescriptor, setSortDescriptor, , sortHydrated] = usePersistedFilters<SortDescriptor>(
    'contacts.sort',
    { column: 'created_at', direction: 'descending' },
  );

  // Column visibility state
  const availableColumns: ColumnConfig[] = useMemo(() => [
    { id: 'full_name', label: t('contacts.name'), isRequired: true },
    { id: 'lifecycle_stage', label: t('contacts.lifecycleStage') },
    { id: 'phone', label: t('contacts.phone') },
    { id: 'company_name', label: t('contacts.company') },
    { id: 'created_at', label: t('common.createdAt') },
  ], [t]);
  
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'full_name', 'lifecycle_stage', 'phone', 'company_name', 'created_at'
  ]);

  // Filtered columns based on visibility - ensures sync between header and cells
  const activeColumns = useMemo(() => 
    availableColumns.filter(col => visibleColumns.includes(col.id)),
    [availableColumns, visibleColumns]
  );
  
  // Current filters and sort for SavedViews
  const currentFilters = { owner: ownerFilter, stage: stageFilter, search: searchTerm };
  const currentSort = { field: 'created_at', direction: 'desc' };
  
  const handleApplyView = (filters: any, sort: any) => {
    if (filters.owner) setOwnerFilter(filters.owner);
    if (filters.stage) setStageFilter(filters.stage);
    if (filters.search) setSearchTerm(filters.search);
  };

  // Reset mobile accumulated contacts when filters change
  useEffect(() => {
    if (isMobile) {
      setMobileContacts([]);
      setCurrentPage(1);
    }
  }, [debouncedSearch, ownerFilter, stageFilter, createdFromFilter, createdToFilter]);

  // Fetch users only when organization changes (not on every filter change)
  useEffect(() => {
    if (!organization?.id) return;
    fetchUsers();
  }, [organization?.id]);

  // Single source of truth for triggering a fetch. Hydration flags are a gate,
  // not a trigger — they must be true, but once true they never re-fire the
  // effect. When any filter changes we snap currentPage back to 1 inline in
  // fetchContacts to avoid the double-fetch cascade.
  useEffect(() => {
    if (!organization) return;
    if (!filtersHydrated || !itemsPerPageHydrated || !sortHydrated) return;
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization, filtersHydrated, itemsPerPageHydrated, sortHydrated, currentPage, itemsPerPage, debouncedSearch, ownerFilter, stageFilter, createdFromFilter, createdToFilter]);


  const mobileHasMore = mobileContacts.length < totalCount;

  const handleMobileLoadMore = () => {
    if (mobileLoadingMore || !mobileHasMore) return;
    setCurrentPage(prev => prev + 1);
  };

  const fetchUsers = async () => {
    if (!organization) return;
    
    const { data } = await supabase
      .from('user_organizations')
      .select('user_id, users(id, full_name)')
      .eq('organization_id', organization.id)
      .eq('is_active', true);
    
    if (data) {
      const usersList = data
        .filter(u => u.users)
        .map(u => ({ id: u.users!.id, full_name: u.users!.full_name }));
      setUsers(usersList);
    }
  };

  // Guard against stale fetch responses overwriting a newer one
  // (typing fast → out-of-order arrivals).
  const fetchIdRef = useRef(0);
  // Real HTTP cancellation: abort obsolete requests so PostgREST/Postgres
  // stop working on them instead of just discarding the response client-side.
  const abortRef = useRef<AbortController | null>(null);
  // Track the last filter signature so we can reset currentPage to 1 inline
  // when the user changes a filter, without a separate useEffect that would
  // cause a double fetch (filter-change → fetch + setCurrentPage(1) → fetch).
  const lastFilterSigRef = useRef<string>('');

  const fetchContacts = async () => {
    if (!organization) return;

    const filterSig = JSON.stringify([
      debouncedSearch, ownerFilter, stageFilter, createdFromFilter, createdToFilter, itemsPerPage,
    ]);
    let effectivePage = currentPage;
    if (lastFilterSigRef.current && lastFilterSigRef.current !== filterSig && currentPage !== 1) {
      // Filters changed while paginated; reset locally and let React commit
      // the state, but do NOT trigger another fetch — this one already
      // reflects page 1.
      effectivePage = 1;
      setCurrentPage(1);
    }
    lastFilterSigRef.current = filterSig;

    const isAppending = isMobile && effectivePage > 1;
    const myFetchId = ++fetchIdRef.current;

    // Cancel any in-flight request. This closes the socket, so PostgREST
    // aborts and Postgres stops executing the obsolete query.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (isAppending) {
      setMobileLoadingMore(true);
    } else if (initialLoading) {
      // keep skeleton visible; do not toggle
    } else {
      setRefetching(true);
    }
    
    // Pagination
    const from = (effectivePage - 1) * itemsPerPage;

    // Use the dedicated RPC. It picks the right branch (no search / phone /
    // text) internally, and returns `total_count` on every row via a single
    // scan. This avoids the PostgREST OR+count wrapper that was making
    // /contacts requests take 2–4s.
    let data: (Contact & { total_count: number })[] | null = null;
    let error: unknown = null;
    try {
      const res = await (supabase.rpc as any)('rpc_search_contacts', {
        p_organization_id: organization.id,
        p_search: debouncedSearch || null,
        p_owner_user_id: ownerFilter !== 'all' ? ownerFilter : null,
        p_lifecycle_stage: stageFilter !== 'all' ? stageFilter : null,
        p_created_from: createdFromFilter || null,
        p_created_to: createdToFilter ? createdToFilter + 'T23:59:59.999Z' : null,
        p_limit: itemsPerPage,
        p_offset: from,
      }).abortSignal(controller.signal);
      data = res.data as (Contact & { total_count: number })[] | null;
      error = res.error;
    } catch (e) {
      if (controller.signal.aborted) return;
      error = e;
    }

    // Drop stale responses (belt-and-suspenders alongside abort).
    if (myFetchId !== fetchIdRef.current) return;
    if (controller.signal.aborted) return;

    if (!error && data) {
      const rows = data.map(({ total_count, ...c }) => c as Contact);
      setContacts(rows);
      if (isMobile) {
        setMobileContacts(prev => isAppending ? [...prev, ...rows] : rows);
      }
      setTotalCount(data.length > 0 ? Number(data[0].total_count) : 0);
    }
    setInitialLoading(false);
    setRefetching(false);
    setMobileLoadingMore(false);
  };

  // Sort contacts client-side
  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const column = sortDescriptor.column as keyof Contact;
      const aVal = a[column];
      const bVal = b[column];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let cmp = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      }

      return sortDescriptor.direction === 'descending' ? -cmp : cmp;
    });
  }, [contacts, sortDescriptor]);

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const handleItemsPerPageChange = (newValue: number) => {
    setItemsPerPage(newValue);
    setCurrentPage(1);
  };

  // Selection handlers
  const allSelected = sortedContacts.length > 0 && sortedContacts.every(c => selectedIds.includes(c.id));
  const someSelected = sortedContacts.some(c => selectedIds.includes(c.id)) && !allSelected;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(sortedContacts.map(c => c.id));
      setSelectAllMode('page');
    } else {
      setSelectedIds([]);
      setSelectAllMode('none');
    }
  };

  const handleSelectAllContacts = async () => {
    if (!organization) return;
    
    // Fetch all contact IDs matching current filters
    let query = supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organization.id)
      .is('deleted_at', null);
    
    if (debouncedSearch) {
      query = applySearchFilters(query, debouncedSearch);
    }
    if (ownerFilter !== 'all') {
      query = query.eq('owner_user_id', ownerFilter);
    }
    if (stageFilter !== 'all') {
      query = query.eq('lifecycle_stage', stageFilter as 'lead' | 'customer' | 'inactive');
    }

    const { data } = await query;
    if (data) {
      setSelectedIds(data.map(c => c.id));
      setSelectAllMode('all');
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
    setSelectAllMode('none');
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));
    } else {
      setSelectedIds((current) => current.filter(i => i !== id));
    }
  };

  const handleDelete = async (contactId: string) => {
    await supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', contactId);
    fetchContacts();
  };

  const handleBulkSuccess = () => {
    setSelectedIds([]);
    setSelectAllMode('none');
    fetchContacts();
  };

  const getLifecycleLabel = (stage: string | null) => {
    if (!stage) return 'Lead';
    return t(`lifecycle.${stage}`) || stage;
  };

  if (isMobile) {
    return (
      <MobileLayout>
        <MobileContactsList
          contacts={mobileContacts}
          loading={loading}
          loadingMore={mobileLoadingMore}
          totalCount={totalCount}
          hasMore={mobileHasMore}
          onLoadMore={handleMobileLoadMore}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          stageFilter={stageFilter}
          onStageFilterChange={setStageFilter}
          canCreate={permissions.canEditContacts}
        />
      </MobileLayout>
    );
  }

  return (
    <Layout>
      <div className="p-8">
        {/* Breadcrumbs */}
        <Breadcrumbs 
          items={[{ label: t('contacts.title') }]} 
          className="mb-6"
        />

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('contacts.title')}</h1>
          <div className="flex gap-2">
            <SavedViewsDropdown
              module="contacts"
              currentFilters={currentFilters}
              currentSort={currentSort}
              onApplyView={handleApplyView}
            />
            {permissions.canEditContacts && (
              <Link to="/contacts/new">
                <Button color="primary" size="md">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('contacts.newContact')}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[250px] max-w-sm">
            <MagnifyingGlass size={16} weight="light" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('common.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Dialog open={showFilters} onOpenChange={setShowFilters}>
            <DialogTrigger asChild>
              <ShadButton variant="outline" className="relative">
                <FunnelSimple size={16} weight="light" className="mr-2" />
                Filtros
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-4 w-4 p-0 flex items-center justify-center rounded-full text-[10px]">
                    {activeFiltersCount}
                  </Badge>
                )}
              </ShadButton>
            </DialogTrigger>
            <DialogContent size="md" className="p-0 max-h-[85vh] flex flex-col gap-0">
              <div className="px-6 py-4 border-b">
                <DialogTitle>Filtros</DialogTitle>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {permissions.viewAllContacts && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('contacts.owner')}</label>
                    <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('contacts.allOwners')} />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="all">{t('contacts.allOwners')}</SelectItem>
                        {userProfile?.id && (
                          <SelectItem value={userProfile.id}>Meus</SelectItem>
                        )}
                        {users.filter(u => u.id !== userProfile?.id).map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('contacts.lifecycleStage')}</label>
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('contacts.allStages')} />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="all">{t('contacts.allStages')}</SelectItem>
                      <SelectItem value="lead">{t('lifecycle.lead')}</SelectItem>
                      <SelectItem value="customer">{t('lifecycle.customer')}</SelectItem>
                      <SelectItem value="inactive">{t('lifecycle.inactive')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Data de Criação</label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={createdFromFilter}
                      onChange={(e) => setCreatedFromFilter(e.target.value)}
                    />
                    <Input
                      type="date"
                      value={createdToFilter}
                      onChange={(e) => setCreatedToFilter(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 border-t flex items-center justify-between gap-2">
                <ShadButton
                  variant="ghost"
                  onClick={clearFilters}
                  disabled={activeFiltersCount === 0}
                >
                  Limpar
                </ShadButton>
                <ShadButton onClick={() => setShowFilters(false)}>
                  Aplicar
                </ShadButton>
              </div>
            </DialogContent>
          </Dialog>

          <ColumnSelector
            columns={availableColumns}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
            label={t('common.columns') || 'Colunas'}
          />
        </div>

        {!initialLoading && !refetching && sortedContacts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{t('contacts.noContacts')}</p>
              <Link to="/contacts/new">
                <Button color="primary" size="md" className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('contacts.newContact')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <TableCard
            footer={
              <PaginationWithPageSize
                currentPage={currentPage}
                totalPages={totalPages || 1}
                totalItems={totalCount}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            }
          >
            {/* Select All Banner */}
            {!initialLoading && allSelected && totalCount > sortedContacts.length && (
              <div className="px-4 py-2 bg-muted/50 border-b text-sm flex items-center justify-center gap-2">
                {selectAllMode === 'all' ? (
                  <>
                    <span>Todos os {totalCount} contatos selecionados.</span>
                    <button
                      className="text-primary font-medium hover:underline"
                      onClick={handleClearSelection}
                    >
                      Limpar seleção
                    </button>
                  </>
                ) : (
                  <>
                    <span>{sortedContacts.length} contatos desta página selecionados.</span>
                    <button
                      className="text-primary font-medium hover:underline"
                      onClick={handleSelectAllContacts}
                    >
                      Selecionar todos os {totalCount} contatos
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="relative">
              {refetching && (
                <div
                  aria-hidden
                  className="absolute top-0 left-0 right-0 h-0.5 bg-primary/60 animate-pulse z-10 pointer-events-none"
                />
              )}
              <div className={refetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
                <Table
                  aria-label="Lista de contatos"
                  sortDescriptor={sortDescriptor}
                  onSortChange={initialLoading ? undefined : setSortDescriptor}
                >
                  <TableHeader>
                    <TableCheckboxHeader
                      isSelected={!initialLoading && allSelected}
                      isIndeterminate={!initialLoading && someSelected}
                      onChange={initialLoading ? () => {} : handleSelectAll}
                    />
                    {activeColumns.map((col) => (
                      <TableColumn
                        key={col.id}
                        id={col.id}
                        allowsSorting={col.id !== 'phone'}
                        sortDescriptor={sortDescriptor}
                      >
                        {col.label}
                      </TableColumn>
                    ))}
                    <TableColumn id="actions" className="w-12">
                      <span className="sr-only">Ações</span>
                    </TableColumn>
                  </TableHeader>
                  {initialLoading ? (
                    <TableBody
                      items={Array.from({ length: Math.min(itemsPerPage, 10) }, (_, i) => ({ id: `__skel_${i}` }))}
                    >
                      {(row) => (
                        <TableRow key={row.id}>
                          <TableCheckboxCell isSelected={false} onChange={() => {}} />
                          {activeColumns.map((col) => (
                            <TableCell key={col.id}>
                              {col.id === 'full_name' ? (
                                <div className="flex items-center gap-3">
                                  <Skeleton className="h-9 w-9 rounded-full" />
                                  <div className="space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-3 w-48" />
                                  </div>
                                </div>
                              ) : col.id === 'lifecycle_stage' ? (
                                <Skeleton className="h-5 w-20 rounded-full" />
                              ) : (
                                <Skeleton className="h-4 w-24" />
                              )}
                            </TableCell>
                          ))}
                          <TableCell>
                            <Skeleton className="h-4 w-4" />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  ) : (
                    <TableBody items={sortedContacts} dependencies={[selectedIds]}>
                      {(contact) => (
                        <TableRow
                          key={contact.id}
                          className="cursor-pointer"
                          onAction={() => navigate(`/contacts/${contact.id}`)}
                        >
                          <TableCheckboxCell
                            isSelected={selectedIds.includes(contact.id)}
                            onChange={(checked) => handleSelectOne(contact.id, checked)}
                          />
                          {activeColumns.map(col => (
                            <TableCell key={col.id}>
                              {col.id === 'full_name' && (
                                <div className="flex items-center gap-3">
                                  <Avatar fallbackText={contact.full_name} size="sm" />
                                  <div>
                                    <p className="font-medium text-foreground">{contact.full_name}</p>
                                    {contact.email && (
                                      <p className="text-sm text-muted-foreground">{contact.email}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {col.id === 'lifecycle_stage' && (
                                <BadgeWithDot color={lifecycleColors[contact.lifecycle_stage] || 'gray'}>
                                  {getLifecycleLabel(contact.lifecycle_stage)}
                                </BadgeWithDot>
                              )}
                              {col.id === 'phone' && (
                                <span className="text-muted-foreground">
                                  {contact.phone ? formatPhoneDisplay(contact.phone) : '—'}
                                </span>
                              )}
                              {col.id === 'company_name' && (
                                <span className="text-muted-foreground">
                                  {contact.company_name || '—'}
                                </span>
                              )}
                              {col.id === 'created_at' && (
                                <span className="text-muted-foreground">
                                  {contact.created_at
                                    ? format(new Date(contact.created_at), 'dd MMM yyyy', { locale: ptBR })
                                    : '—'}
                                </span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell>
                            <TableRowActionsDropdown>
                              <TableRowAction
                                label={t('common.edit')}
                                icon={<PencilSimple size={16} weight="light" />}
                                onAction={() => navigate(`/contacts/${contact.id}/edit`)}
                              />
                              <TableRowAction
                                label={t('common.delete')}
                                icon={<TrashSimple size={16} weight="light" />}
                                variant="destructive"
                                onAction={() => handleDelete(contact.id)}
                              />
                            </TableRowActionsDropdown>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  )}
                </Table>
              </div>
            </div>
          </TableCard>
        )}

        <BulkActionsBar
          selectedIds={selectedIds}
          module="contacts"
          users={users}
          onClear={handleClearSelection}
          onSuccess={handleBulkSuccess}
          locale={locale}
          canEdit={permissions.canEditContacts}
          canDelete={permissions.canDeleteContacts}
        />
      </div>
    </Layout>
  );
}
```

### 9.2 `src/pages/contacts/ContactForm.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowLeft } from '@phosphor-icons/react';
import { NameInput } from '@/components/NameInput';
import { OwnerSelector } from '@/components/common/OwnerSelector';

/**
 * Porta em TS a função public.normalize_phone_br do banco.
 * Necessário pra checagem de duplicidade encontrar contatos
 * salvos com/sem o 9º dígito (formato antigo).
 */
function normalizePhoneBR(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return digits || null;

  let local: string;
  if (digits.startsWith('55') && digits.length >= 12) {
    local = digits.substring(2);
  } else {
    return digits;
  }

  if (local.length !== 10 && local.length !== 11) return digits;

  const ddd = local.substring(0, 2);
  const rest = local.substring(2);

  if (local.length === 11 && rest.charAt(0) === '9') {
    return '55' + local;
  }
  if (local.length === 10) {
    return '55' + ddd + '9' + rest;
  }
  return '55' + local;
}


export default function ContactForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization, userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    full_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_name: '',
    company_id: null as string | null,
    lifecycle_stage: 'lead' as 'lead' | 'customer' | 'inactive',
    do_not_contact: false,
    owner_user_id: userProfile?.id || null as string | null,
    cpf: '',
    rg: '',
    rg_issuer: '',
    nationality: '',
    address_street: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    address_zip: '',
  });
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (isEdit) {
      fetchContact();
    }
    if (organization?.enable_companies_module) {
      fetchCompanies();
    }
  }, [id, organization?.enable_companies_module]);

  const fetchCompanies = async () => {
    if (!organization?.id) return;
    
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('organization_id', organization.id)
      .is('deleted_at', null)
      .order('name');
    
    if (data) {
      setCompanies(data);
    }
  };

  const fetchContact = async () => {
    if (!organization || !id) return;

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (data) {
      setFormData({
        full_name: data.full_name || '',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        phone: data.phone || '',
        company_name: data.company_name || '',
        company_id: data.company_id || null,
        lifecycle_stage: data.lifecycle_stage || 'lead',
        do_not_contact: data.do_not_contact || false,
        owner_user_id: data.owner_user_id || null,
        cpf: (data as any).cpf || '',
        rg: (data as any).rg || '',
        rg_issuer: (data as any).rg_issuer || '',
        nationality: (data as any).nationality || '',
        address_street: (data as any).address_street || '',
        address_neighborhood: (data as any).address_neighborhood || '',
        address_city: (data as any).address_city || '',
        address_state: (data as any).address_state || '',
        address_zip: (data as any).address_zip || '',
      });
    }
  };

  const checkDuplicates = async () => {
    if (!organization) return [];

    const checkMode = organization.duplicate_check_mode || 'none';
    if (checkMode === 'none') return [];

    let query = supabase
      .from('contacts')
      .select('id, full_name, email, phone')
      .eq('organization_id', organization.id)
      .is('deleted_at', null);

    // Exclude current contact if editing
    if (isEdit && id) {
      query = query.neq('id', id);
    }

    let conditions: any[] = [];

    if (checkMode === 'email' && formData.email) {
      conditions.push({ email: formData.email });
    } else if (checkMode === 'phone' && formData.phone) {
      conditions.push({ phone_normalized: normalizePhoneBR(formData.phone) });
    } else if (checkMode === 'email_or_phone') {
      if (formData.email) conditions.push({ email: formData.email });
      if (formData.phone) conditions.push({ phone_normalized: normalizePhoneBR(formData.phone) });
    }

    if (conditions.length === 0) return [];

    // Check for duplicates
    const duplicateResults = [];
    for (const condition of conditions) {
      if (condition.email) {
        const { data } = await query.eq('email', condition.email);
        if (data) duplicateResults.push(...data);
      }
      if (condition.phone_normalized) {
        const { data } = await query.eq('phone_normalized', condition.phone_normalized);
        if (data) duplicateResults.push(...data);
      }
    }

    // Remove duplicates from results
    const unique = Array.from(new Map(duplicateResults.map(item => [item.id, item])).values());
    return unique;
  };

  const checkPhoneUniqueness = async () => {
    if (!organization || !formData.phone) return [];
    const normalized = normalizePhoneBR(formData.phone);
    if (!normalized) return [];
    let query = supabase
      .from('contacts')
      .select('id, full_name, email, phone')
      .eq('organization_id', organization.id)
      .eq('phone_normalized', normalized)
      .is('deleted_at', null);
    if (isEdit && id) query = query.neq('id', id);
    const { data } = await query;
    return data || [];
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !userProfile) return;

    setLoading(true);

    // Check for duplicates (org rule)
    const foundDuplicates = await checkDuplicates();

    // Always check phone uniqueness — DB has a unique index on (org, phone_normalized)
    const phoneDuplicates = await checkPhoneUniqueness();
    const allDuplicates = Array.from(
      new Map([...foundDuplicates, ...phoneDuplicates].map((d) => [d.id, d])).values()
    );

    if (allDuplicates.length > 0) {
      setDuplicates(allDuplicates);
      setShowDuplicateWarning(true);

      // Phone duplicates are always blocking (DB unique index)
      const hasPhoneDup = phoneDuplicates.length > 0;

      if (organization.duplicate_enforce_block || hasPhoneDup) {
        toast.error(
          hasPhoneDup
            ? 'Já existe um contato com este telefone nesta organização'
            : t('contacts.duplicateFound')
        );
        setLoading(false);
        return;
      }

      setLoading(false);
      return;
    }

    // Proceed with save
    await saveContact();
  };

  const saveContact = async () => {
    if (!organization || !userProfile) return;
    
    setLoading(true);

    const contactData = {
      ...formData,
      organization_id: organization.id,
      owner_user_id: formData.owner_user_id || userProfile.id,
    };

    const handleDbError = async (error: any) => {
      // Postgres unique violation
      if (error?.code === '23505') {
        const msg = String(error?.message || '');
        if (msg.includes('phone_normalized') || msg.includes('phone')) {
          const dups = await checkPhoneUniqueness();
          if (dups.length > 0) {
            setDuplicates(dups);
            setShowDuplicateWarning(true);
          }
          toast.error('Já existe um contato com este telefone nesta organização');
          return;
        }
        if (msg.includes('email')) {
          toast.error('Já existe um contato com este e-mail nesta organização');
          return;
        }
      }
      toast.error(error?.message || t('common.error'));
    };

    if (isEdit) {
      const { error } = await supabase
        .from('contacts')
        .update({ ...contactData, updated_by: userProfile.id } as any)
        .eq('id', id);

      if (error) {
        await handleDbError(error);
        setLoading(false);
        return;
      }

      toast.success(t('contacts.updated'));
      navigate(`/contacts/${id}`);
    } else {
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...contactData, created_by: userProfile.id } as any)
        .select()
        .single();

      if (error) {
        await handleDbError(error);
        setLoading(false);
        return;
      }

      toast.success(t('contacts.created'));
      navigate(`/contacts/${data.id}`);
    }
  };

  const handleForceSave = async () => {
    setShowDuplicateWarning(false);
    setDuplicates([]);
    await saveContact();
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="flex items-center gap-4 px-6 py-4">
            <Link to={isEdit ? `/contacts/${id}` : '/contacts'}>
              <Button color="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">
              {isEdit ? t('contacts.editContact') : t('contacts.newContact')}
            </h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Card className="max-w-2xl mx-auto p-6">
            {showDuplicateWarning && duplicates.length > 0 && (() => {
              const hasPhoneDup = duplicates.some((d) => d.phone && d.phone === formData.phone);
              return (
                <div className="mb-6 p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
                  <h3 className="font-semibold text-destructive mb-2">
                    {t('contacts.duplicateWarning')}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {hasPhoneDup
                      ? 'Já existe um contato com este telefone. Deseja abrir o contato existente?'
                      : t('contacts.duplicateDescription')}
                  </p>
                  <div className="space-y-2 mb-4">
                    {duplicates.map((dup) => (
                      <div key={dup.id} className="text-sm p-2 bg-background rounded border flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{dup.full_name}</div>
                          {dup.email && <div className="text-muted-foreground truncate">{dup.email}</div>}
                          {dup.phone && <div className="text-muted-foreground">{dup.phone}</div>}
                        </div>
                        <Button
                          type="button"
                          color="primary"
                          size="sm"
                          onClick={() => navigate(`/contacts/${dup.id}`)}
                        >
                          Abrir contato
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {!hasPhoneDup && !organization?.duplicate_enforce_block && (
                      <Button type="button" onClick={handleForceSave} color="destructive">
                        {t('contacts.saveDespiteDuplicate')}
                      </Button>
                    )}
                    <Button type="button" onClick={() => setShowDuplicateWarning(false)} color="secondary">
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              );
            })()}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <NameInput
                locale={locale as any}
                fullName={formData.full_name}
                firstName={formData.first_name}
                lastName={formData.last_name}
                onFullNameChange={(value) => setFormData({ ...formData, full_name: value })}
                onFirstNameChange={(value) => setFormData({ ...formData, first_name: value })}
                onLastNameChange={(value) => setFormData({ ...formData, last_name: value })}
              />

              <div>
                <Label htmlFor="email">{t('contacts.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="phone">{t('contacts.phone')}</Label>
                <PhoneInput
                  id="phone"
                  value={formData.phone}
                  onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                />
              </div>

              {organization?.enable_companies_module ? (
                <div>
                  <Label htmlFor="company">{t('contacts.company')}</Label>
                  <Select
                    value={formData.company_id || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, company_id: value === 'none' ? null : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('common.select')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('common.none')}</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label htmlFor="company">{t('contacts.company')}</Label>
                  <Input
                    id="company"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="lifecycle">{t('contacts.lifecycleStage')}</Label>
                <Select
                  value={formData.lifecycle_stage}
                  onValueChange={(value: any) => setFormData({ ...formData, lifecycle_stage: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">{t('lifecycle.lead')}</SelectItem>
                    <SelectItem value="customer">{t('lifecycle.customer')}</SelectItem>
                    <SelectItem value="inactive">{t('lifecycle.inactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('contacts.owner') || 'Responsável'}</Label>
                <OwnerSelector
                  value={formData.owner_user_id}
                  onChange={(userId) => setFormData({ ...formData, owner_user_id: userId })}
                />
              </div>

              {/* Documentos */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b pb-2">Documentos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cpf">CPF</Label>
                    <Input
                      id="cpf"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rg">RG</Label>
                    <Input
                      id="rg"
                      value={formData.rg}
                      onChange={(e) => setFormData({ ...formData, rg: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rg_issuer">Órgão Emissor</Label>
                    <Input
                      id="rg_issuer"
                      value={formData.rg_issuer}
                      onChange={(e) => setFormData({ ...formData, rg_issuer: e.target.value })}
                      placeholder="SSP/SP"
                    />
                  </div>
                  <div>
                    <Label htmlFor="nationality">Nacionalidade</Label>
                    <Input
                      id="nationality"
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      placeholder="brasileiro(a)"
                    />
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b pb-2">Endereço</h3>
                <div>
                  <Label htmlFor="address_street">Rua / Número</Label>
                  <Input
                    id="address_street"
                    value={formData.address_street}
                    onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="address_neighborhood">Bairro</Label>
                    <Input
                      id="address_neighborhood"
                      value={formData.address_neighborhood}
                      onChange={(e) => setFormData({ ...formData, address_neighborhood: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="address_city">Cidade</Label>
                    <Input
                      id="address_city"
                      value={formData.address_city}
                      onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="address_state">Estado</Label>
                    <Input
                      id="address_state"
                      value={formData.address_state}
                      onChange={(e) => setFormData({ ...formData, address_state: e.target.value })}
                      placeholder="SP"
                    />
                  </div>
                  <div>
                    <Label htmlFor="address_zip">CEP</Label>
                    <Input
                      id="address_zip"
                      value={formData.address_zip}
                      onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                      placeholder="00000-000"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="doNotContact"
                  checked={formData.do_not_contact}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, do_not_contact: checked as boolean })
                  }
                />
                <Label htmlFor="doNotContact">{t('contacts.doNotContact')}</Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" color="primary" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
                <Button
                  type="button"
                  color="secondary"
                  onClick={() => navigate(isEdit ? `/contacts/${id}` : '/contacts')}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
```

### 9.3 `src/lib/phoneUtils.ts`

```ts
/**
 * Utilitário para formatação de números de telefone com suporte a múltiplos países
 */

export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  placeholder: string;
}

export const COUNTRIES: Country[] = [
  { code: 'BR', name: 'Brasil', dialCode: '55', flag: '🇧🇷', placeholder: '(11) 96429-8621' },
  { code: 'US', name: 'EUA', dialCode: '1', flag: '🇺🇸', placeholder: '(555) 123-4567' },
  { code: 'PT', name: 'Portugal', dialCode: '351', flag: '🇵🇹', placeholder: '912 345 678' },
  { code: 'AR', name: 'Argentina', dialCode: '54', flag: '🇦🇷', placeholder: '11 1234-5678' },
  { code: 'CL', name: 'Chile', dialCode: '56', flag: '🇨🇱', placeholder: '9 1234 5678' },
  { code: 'MX', name: 'México', dialCode: '52', flag: '🇲🇽', placeholder: '55 1234 5678' },
  { code: 'AU', name: 'Australia', dialCode: '61', flag: '🇦🇺', placeholder: '412 345 678' },
];

/**
 * Detecta o país a partir de um número E.164
 */
export function detectCountryFromE164(phone: string): string {
  if (!phone) return 'BR';

  const cleaned = phone.replace(/\D/g, '');

  // Check each country's dial code (longer codes first to avoid false matches)
  const sortedCountries = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

  for (const country of sortedCountries) {
    if (cleaned.startsWith(country.dialCode)) {
      // BR special case: dial code "55" collides with DDD 55.
      // Only treat leading "55" as country code if total length matches E.164 BR (12 or 13 digits).
      if (country.code === 'BR' && cleaned.length !== 12 && cleaned.length !== 13) {
        continue;
      }
      return country.code;
    }
  }

  return 'BR'; // Default
}

/**
 * Formata número para exibição baseado no país
 */
export function formatPhoneForCountry(phone: string, countryCode: string): string {
  if (!phone) return '';
  
  // Remove tudo que não é número
  let cleaned = phone.replace(/\D/g, '');
  
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) return phone;
  
  // Remove o código do país se presente
  if (cleaned.startsWith(country.dialCode)) {
    const rest = cleaned.substring(country.dialCode.length);
    // BR special case: only strip leading "55" if remainder is a valid local length (10/11)
    // OR if total length is already E.164 BR (12 or 13). Intermediate lengths keep digits as-is.
    if (country.code !== 'BR' || rest.length === 10 || rest.length === 11 || cleaned.length >= 12) {
      cleaned = rest;
    }
  }
  
  // Formata baseado no país
  switch (countryCode) {
    case 'BR':
      // 11 dígitos = celular com 9 (DDD + 9 + 8 dígitos)
      if (cleaned.length === 11) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
      }
      // 10 dígitos = fixo (DDD + 8 dígitos)
      if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
      }
      // 9 dígitos = celular sem DDD
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
      }
      // 8 dígitos = fixo sem DDD
      if (cleaned.length === 8) {
        return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
      }
      break;
      
    case 'US':
      // 10 dígitos = (555) 123-4567
      if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
      }
      break;
      
    case 'PT':
      // 9 dígitos = 912 345 678
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
      }
      break;
      
    case 'AR':
      // 10 dígitos = 11 1234-5678
      if (cleaned.length === 10) {
        return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
      }
      break;
      
    case 'CL':
      // 9 dígitos = 9 1234 5678
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 1)} ${cleaned.slice(1, 5)} ${cleaned.slice(5)}`;
      }
      break;
      
    case 'MX':
      // 10 dígitos = 55 1234 5678
      if (cleaned.length === 10) {
        return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
      }
      break;
      
    case 'AU':
      // 9 dígitos = 412 345 678
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
      }
      break;
  }
  
  return cleaned;
}

/**
 * Constrói número E.164 a partir de número local + código do país
 */
export function buildE164(localNumber: string, countryCode: string): string {
  if (!localNumber) return '';
  
  const cleaned = localNumber.replace(/\D/g, '');
  if (!cleaned) return '';
  
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) return `+55${cleaned}`;
  
  // Se já começa com o código do país, não duplica
  if (cleaned.startsWith(country.dialCode)) {
    // BR special case: "55" inicial pode ser DDD, não country code.
    // Só tratar como country code se o comprimento total for válido (12 ou 13).
    if (country.code === 'BR' && cleaned.length !== 12 && cleaned.length !== 13) {
      return `+${country.dialCode}${cleaned}`;
    }
    return `+${cleaned}`;
  }
  
  return `+${country.dialCode}${cleaned}`;
}

/**
 * Formata número para exibição no padrão brasileiro (legacy - mantido para compatibilidade)
 * Celular: (11) 96429-8621
 * Fixo: (11) 6429-8621
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  return formatPhoneForCountry(phone, detectCountryFromE164(phone));
}

/**
 * Formata número para E.164 (padrão internacional do Twilio)
 * Entrada: 11964298621 → Saída: +5511964298621
 * Entrada: (11) 96429-8621 → Saída: +5511964298621
 */
export function formatPhoneE164(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove tudo que não é número ou +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Se já começa com +, assume que está formatado
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // Detecta o país e constrói E.164
  const country = detectCountryFromE164(cleaned);
  return buildE164(cleaned, country);
}
```

### 9.4 `src/hooks/contacts/useContactConversationsByContext.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BusinessContext = 'sales' | 'customer_service';

export interface ContextThreadRow {
  id: string;
  business_context: BusinessContext | null;
  primary_endpoint_id: string | null;
  status: string | null;
  assigned_user_id: string | null;
  last_message_at: string | null;
  last_message_content: string | null;
  last_message_direction: string | null;
  created_at: string;
  endpoint?: {
    id: string;
    external_address: string | null;
    provider: string | null;
    purpose: string | null;
  } | null;
  assigned_user_name?: string | null;
  message_count?: number;
  real_message_count?: number;
  last_real_message_at?: string | null;
}

export interface ContactConversationsResult {
  sales: ContextThreadRow | null;
  customer_service: ContextThreadRow | null;
}

/**
 * Regra determinística do card Conversas:
 *   1. Maior real_message_count.
 *   2. Empate: maior last_real_message_at (fallback last_message_at).
 *   3. Empate final: menor created_at (thread mais antiga vence — é a
 *      "principal", duplicatas costumam ser posteriores).
 *
 * Threads vazias (real_message_count = 0) NUNCA vencem threads com
 * mensagens reais, mesmo que estejam open/mais recentes.
 */
function pickRepresentative(rows: ContextThreadRow[]): ContextThreadRow | null {
  if (rows.length === 0) return null;

  const cmpDesc = (a: string | null, b: string | null) => {
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return b.localeCompare(a);
  };

  return [...rows].sort((a, b) => {
    const ac = a.real_message_count ?? 0;
    const bc = b.real_message_count ?? 0;
    if (ac !== bc) return bc - ac;

    const aLast = a.last_real_message_at ?? a.last_message_at ?? null;
    const bLast = b.last_real_message_at ?? b.last_message_at ?? null;
    const byLast = cmpDesc(aLast, bLast);
    if (byLast !== 0) return byLast;

    return a.created_at.localeCompare(b.created_at);
  })[0] ?? null;
}

export function useContactConversationsByContext(contactId: string | null | undefined) {
  return useQuery<ContactConversationsResult>({
    queryKey: ['contact-conversations-by-context', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const empty: ContactConversationsResult = { sales: null, customer_service: null };
      if (!contactId) return empty;

      const { data: threadRows, error } = await supabase
        .from('message_threads')
        .select(
          'id, business_context, primary_endpoint_id, status, assigned_user_id, last_message_at, last_message_content, last_message_direction, created_at',
        )
        .eq('contact_id', contactId)
        .eq('channel', 'whatsapp')
        .in('business_context', ['sales', 'customer_service']);

      if (error) {
        console.error('[useContactConversationsByContext]', error);
        return empty;
      }

      const rows = (threadRows ?? []) as ContextThreadRow[];

      // Blindagem contra duplicatas vazias: a escolha do card deve ser guiada
      // pelas mensagens reais, não só por updated_at/status da thread.
      const threadIds = rows.map((r) => r.id);
      if (threadIds.length > 0) {
        const { data: messageRows, error: msgError } = await supabase
          .from('messages')
          .select('thread_id, content, direction, sent_at, created_at, is_internal_note')
          .in('thread_id', threadIds)
          .is('deleted_at', null)
          .in('direction', ['inbound', 'outbound'])
          .or('is_internal_note.is.false,is_internal_note.is.null')
          .order('sent_at', { ascending: false });

        if (!msgError) {
          const messageStats = new Map<
            string,
            { count: number; last_at: string | null; last_content: string | null; last_direction: string | null }
          >();

          for (const msg of (messageRows ?? []) as any[]) {
            const threadId = msg.thread_id as string;
            const current = messageStats.get(threadId) ?? {
              count: 0,
              last_at: null,
              last_content: null,
              last_direction: null,
            };
            current.count += 1;

            const msgAt = (msg.sent_at ?? msg.created_at ?? null) as string | null;
            if (msgAt && (!current.last_at || msgAt > current.last_at)) {
              current.last_at = msgAt;
              current.last_content = (msg.content ?? null) as string | null;
              current.last_direction = (msg.direction ?? null) as string | null;
            }
            messageStats.set(threadId, current);
          }

          for (const row of rows) {
            const stats = messageStats.get(row.id);
            row.message_count = stats?.count ?? 0;
            row.real_message_count = stats?.count ?? 0;
            row.last_real_message_at = stats?.last_at ?? null;
            if (stats?.last_at) {
              row.last_message_at = stats.last_at;
              row.last_message_content = stats.last_content;
              row.last_message_direction = stats.last_direction;
            }
          }
        } else {
          console.error('[useContactConversationsByContext] messages lookup', msgError);
        }
      }

      const sales = pickRepresentative(rows.filter((r) => r.business_context === 'sales'));
      const cs = pickRepresentative(rows.filter((r) => r.business_context === 'customer_service'));

      // Enriquecer com endpoint + usuário responsável
      const endpointIds = Array.from(
        new Set([sales?.primary_endpoint_id, cs?.primary_endpoint_id].filter(Boolean) as string[]),
      );
      const userIds = Array.from(
        new Set([sales?.assigned_user_id, cs?.assigned_user_id].filter(Boolean) as string[]),
      );

      const [endpointsRes, usersRes] = await Promise.all([
        endpointIds.length
          ? supabase
              .from('communication_endpoints')
              .select('id, external_address, provider, purpose')
              .in('id', endpointIds)
          : Promise.resolve({ data: [], error: null } as any),
        userIds.length
          ? supabase.from('users').select('id, full_name').in('id', userIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const epMap = new Map<string, ContextThreadRow['endpoint']>();
      for (const ep of (endpointsRes.data ?? []) as any[]) {
        epMap.set(ep.id, ep);
      }
      const uMap = new Map<string, string | null>();
      for (const u of (usersRes.data ?? []) as any[]) {
        uMap.set(u.id, u.full_name ?? null);
      }

      const decorate = (r: ContextThreadRow | null): ContextThreadRow | null => {
        if (!r) return null;
        return {
          ...r,
          endpoint: r.primary_endpoint_id ? epMap.get(r.primary_endpoint_id) ?? null : null,
          assigned_user_name: r.assigned_user_id ? uMap.get(r.assigned_user_id) ?? null : null,
        };
      };

      return { sales: decorate(sales), customer_service: decorate(cs) };
    },
  });
}
```

### 9.5 `src/components/mobile/MobileContactsList.tsx`

```tsx
import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MagnifyingGlass, Envelope, Phone } from '@phosphor-icons/react';
import { Avatar } from '@/components/base/avatar/avatar';
import { MobileSpinner } from '@/components/mobile/MobileSpinner';
import { BadgeWithDot } from '@/components/base/badges/badges';
import type { BadgeColor } from '@/components/base/badges/badge-types';
import { Input } from '@/components/ui/input';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  lifecycle_stage: string;
  owner_user_id: string | null;
  created_at: string;
}

interface MobileContactsListProps {
  contacts: Contact[];
  loading: boolean;
  loadingMore: boolean;
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  stageFilter: string;
  onStageFilterChange: (value: string) => void;
  canCreate: boolean;
}

const lifecycleColors: Record<string, BadgeColor> = {
  lead: 'blue',
  qualified: 'purple',
  opportunity: 'warning',
  customer: 'success',
  churned: 'error',
  inactive: 'gray',
};

const lifecycleLabels: Record<string, string> = {
  lead: 'Lead',
  qualified: 'Qualificado',
  opportunity: 'Oportunidade',
  customer: 'Cliente',
  churned: 'Churned',
  inactive: 'Inativo',
};

const stageChips = [
  { value: 'all', label: 'Todos' },
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'customer', label: 'Cliente' },
  { value: 'inactive', label: 'Inativo' },
];

export function MobileContactsList({
  contacts,
  loading,
  loadingMore,
  totalCount,
  hasMore,
  onLoadMore,
  searchTerm,
  onSearchChange,
  stageFilter,
  onStageFilterChange,
  canCreate,
}: MobileContactsListProps) {
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, onLoadMore]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search + summary */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="relative">
          <MagnifyingGlass size={16} weight="light" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar contatos..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground font-data">
          {totalCount} contato{totalCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Stage filter chips */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
        {stageChips.map((chip) => (
          <button
            key={chip.value}
            onClick={() => onStageFilterChange(chip.value)}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
              stageFilter === chip.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-auto px-4 py-2 space-y-2 scrollbar-hide">
        {loading && contacts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <MobileSpinner />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-sm text-muted-foreground">Nenhum contato encontrado</p>
          </div>
        ) : (
          <>
            {contacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => navigate(`/contacts/${contact.id}`)}
                className="w-full text-left bg-card border border-border rounded-md p-3 flex items-start gap-3 active:bg-muted/50 transition-colors"
              >
                <Avatar fallbackText={contact.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {contact.full_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {contact.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Phone size={12} weight="light" />
                        {formatPhoneDisplay(contact.phone)}
                      </span>
                    )}
                    {contact.email && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Envelope size={12} weight="light" />
                        {contact.email}
                      </span>
                    )}
                  </div>
                  {contact.company_name && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {contact.company_name}
                    </p>
                  )}
                </div>
                <BadgeWithDot
                  color={lifecycleColors[contact.lifecycle_stage] || 'gray'}
                  size="sm"
                >
                  {lifecycleLabels[contact.lifecycle_stage] || contact.lifecycle_stage || 'Lead'}
                </BadgeWithDot>
              </button>
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4" />

            {loadingMore && (
              <div className="flex items-center justify-center py-3">
                <MobileSpinner size="sm" />
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      {canCreate && (
        <button
          onClick={() => navigate('/contacts/new')}
          className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus size={24} weight="bold" />
        </button>
      )}
    </div>
  );
}
```

### 9.6 `src/pages/contacts/ContactDetail.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Key } from 'react-aria-components';
import { Layout } from '@/components/Layout';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { MobileSpinner } from '@/components/mobile/MobileSpinner';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { useVoiceIntegration } from '@/hooks/useVoiceIntegration';
import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { LeadOriginBadge } from '@/components/contacts/LeadOriginBadge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { EnvelopeSimple, Phone, Buildings, PencilSimple, TrashSimple, DotsThreeVertical, DotsThree, ChatCircle, User, UserPlus, FileText, MapPin, Calendar, Megaphone, ArrowSquareOut, CaretLeft, Archive, ArrowsLeftRight } from '@phosphor-icons/react';
import { Breadcrumbs } from '@/components/application/breadcrumbs/breadcrumbs';
import { Tabs } from '@/components/application/tabs/tabs';
import { NativeSelect } from '@/components/base/select/select-native';
import { Avatar } from '@/components/base/avatar/avatar';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { OwnerSelector } from '@/components/common/OwnerSelector';

import { ActivityTimeline } from '@/components/contacts/ActivityTimeline';
import { ContactTasks } from '@/components/contacts/ContactTasks';
import { ContactCalls } from '@/components/contacts/ContactCalls';
import { ContactMessages } from '@/components/contacts/ContactMessages';
import { ContactConversations } from '@/components/contacts/ContactConversations';
import { ContactAttachments } from '@/components/contacts/ContactAttachments';
import { ContactOpportunities } from '@/components/contacts/ContactOpportunities';
import { ContactNotes } from '@/components/contacts/ContactNotes';
import { DocumentChecklist } from '@/components/documents/DocumentChecklist';

const getLifecycleColor = (stage: string | null): "gray" | "blue" | "purple" | "success" | "error" => {
  switch (stage) {
    case 'lead': return 'blue';
    case 'prospect': return 'purple';
    case 'customer': return 'success';
    case 'churned': return 'error';
    default: return 'gray';
  }
};

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { organization, locale, loading: orgLoading, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { permissions } = usePermissions();
  const { hasVoiceIntegration } = useVoiceIntegration();
  const { startCall } = useOutboundCall();
  const [contact, setContact] = useState<any>(null);
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<Key>("details");
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [maisOpen, setMaisOpen] = useState(false);

  const tabs = [
    { id: "details", label: isMobile ? 'Resumo' : t('contacts.details') },
    { id: "timeline", label: t('contacts.timeline') },
    { id: "opportunities", label: t('contacts.opportunitiesTab') },
    { id: "tasks", label: t('contacts.tasksTab') },
    { id: "notes", label: t('contacts.notesTab') },
    { id: "calls", label: t('contacts.callsTab') },
    ...(!isMobile ? [{ id: "messages", label: locale === 'pt-BR' ? 'Conversas' : 'Conversations' }] : []),
    { id: "attachments", label: t('contacts.attachmentsTab') },
    { id: "documents", label: "Documentos" },
  ];

  useEffect(() => {
    if (organization?.id) {
      fetchContact();
    }
  }, [id, organization?.id]);

  const fetchContact = async () => {
    if (!organization || !id) return;

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (error) {
      toast.error(t('common.error'));
      return;
    }

    setContact(data);

    // Fetch linked marketing campaign for origin badge
    if (data?.marketing_campaign_id) {
      const { data: mc } = await supabase
        .from('marketing_campaigns')
        .select('id, display_name, ad_name, adset_name, campaign_name')
        .eq('id', data.marketing_campaign_id)
        .maybeSingle();
      setCampaign(mc);
    } else {
      setCampaign(null);
    }

    // Fetch created_by / updated_by names
    const byIds = [data?.created_by, data?.updated_by].filter(Boolean) as string[];
    if (byIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', byIds);
      const map = new Map((users || []).map((u: any) => [u.id, u.full_name]));
      setCreatedByName(data?.created_by ? map.get(data.created_by) || 'Sistema' : null);
      setUpdatedByName(data?.updated_by ? map.get(data.updated_by) || 'Sistema' : null);
    } else {
      setCreatedByName(null);
      setUpdatedByName(null);
    }

    setLoading(false);
  };

  const handleDelete = async () => {
    if (!contact) return;

    const { error } = await supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', contact.id);

    if (error) {
      toast.error(t('common.error'));
      return;
    }

    toast.success(t('contacts.deleted'));
    navigate('/contacts');
  };

  // ── Mobile tab content renderer ──
  const renderTabContent = () => {
    switch (selectedTab) {
      case 'details':
        return (
          <div className="space-y-5 pt-4">
            {/* Contato */}
            <div className="bg-white/[0.04] rounded-[10px] p-4">
              <div className="text-[12px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">Contato</div>
              <div className="space-y-3">
                {contact?.email && (
                  <div className="flex items-center gap-3">
                    <EnvelopeSimple className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-muted-foreground/35">{t('contacts.email')}</div>
                      <a href={`mailto:${contact.email}`} className="text-[14px] text-primary">{contact.email}</a>
                    </div>
                  </div>
                )}
                {contact?.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-muted-foreground/35">{t('contacts.phone')}</div>
                      <div className="text-[14px]">{formatPhoneDisplay(contact.phone)}</div>
                    </div>
                  </div>
                )}
                {contact?.company_name && (
                  <div className="flex items-center gap-3">
                    <Buildings className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-muted-foreground/35">{t('contacts.company')}</div>
                      <div className="text-[14px]">{contact.company_name}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-muted-foreground/35">{t('contacts.owner') || 'Responsável'}</div>
                    {contact?.owner_user_id ? (
                      <OwnerSelector
                        value={contact?.owner_user_id}
                        onChange={async (userId) => {
                          const { error } = await supabase
                            .from('contacts')
                            .update({ owner_user_id: userId, updated_by: userProfile?.id || null } as any)
                            .eq('id', contact.id);
                          if (error) {
                            toast.error(t('common.error'));
                          } else {
                            setContact({ ...contact, owner_user_id: userId });
                            toast.success(t('contacts.updated'));
                          }
                        }}
                        size="sm"
                      />
                    ) : (
                      <div className="text-[14px] text-muted-foreground/50">Sem responsável</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Documentos */}
            <div className="bg-white/[0.04] rounded-[10px] p-4">
              <div className="text-[12px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">Documentos</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground/40">CPF</div>
                  <div className="text-[14px]">{contact?.cpf || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground/40">RG</div>
                  <div className="text-[14px]">{contact?.rg ? `${contact.rg}${contact.rg_issuer ? ` - ${contact.rg_issuer}` : ''}` : '—'}</div>
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div className="bg-white/[0.04] rounded-[10px] p-4">
              <div className="text-[12px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">Endereço</div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                <div className="text-[14px]">
                  {contact?.address_street || contact?.address_city ? (
                    <>
                      {contact.address_street && <div>{contact.address_street}</div>}
                      {contact.address_neighborhood && <div>{contact.address_neighborhood}</div>}
                      <div>
                        {[contact.address_city, contact.address_state].filter(Boolean).join(' - ')}
                        {contact.address_zip && ` · CEP ${contact.address_zip}`}
                      </div>
                    </>
                  ) : '—'}
                </div>
              </div>
            </div>
          </div>
        );
      case 'timeline': return <ActivityTimeline contactId={contact!.id} />;
      case 'opportunities': return <ContactOpportunities contactId={contact!.id} />;
      case 'tasks': return <ContactTasks contactId={contact!.id} />;
      case 'notes': return <ContactNotes contactId={contact!.id} />;
      case 'calls': return <ContactCalls contactId={contact!.id} contactPhone={contact?.phone} contactName={contact?.full_name} />;
      case 'messages': return <ContactConversations contactId={contact!.id} />;
      case 'attachments': return <ContactAttachments contactId={contact!.id} />;
      default: return null;
    }
  };

  // ── Mobile ──
  if (isMobile) {
    if (orgLoading || loading) {
      return (
        <MobileLayout>
          <div className="flex items-center justify-center h-full">
            <MobileSpinner />
          </div>
        </MobileLayout>
      );
    }
    if (!contact) {
      return (
        <MobileLayout>
          <div className="p-4 text-center text-muted-foreground">{t('common.noResults')}</div>
        </MobileLayout>
      );
    }
    return (
      <MobileLayout>
        <div className="flex flex-col h-full">
          {/* Back button */}
          <div className="px-4 pt-3 pb-1">
            <button
              onClick={() => navigate('/contacts')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <CaretLeft size={16} weight="bold" />
              {t('contacts.title')}
            </button>
          </div>

          {/* Avatar + Name header */}
          <div className="flex flex-col items-center px-4 pt-2 pb-4 gap-2">
            <Avatar fallbackText={contact.full_name} size="xl" />
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <h1 className="text-lg font-semibold text-foreground">{contact.full_name}</h1>
              {contact.lifecycle_stage && (
                <Badge color={getLifecycleColor(contact.lifecycle_stage)} size="sm">
                  {contact.lifecycle_stage}
                </Badge>
              )}
            </div>
            <LeadOriginBadge contact={contact} campaign={campaign} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-2 px-4 pb-4">
            <Button color="secondary" size="sm" onClick={() => navigate(`/messages?contact=${contact.id}`)}>
              <ChatCircle className="h-4 w-4 mr-1.5" />
              Mensagens
            </Button>
            {hasVoiceIntegration && contact.phone && (
              <Button color="secondary" size="sm" onClick={() => startCall({ phoneNumber: contact.phone, contactId: contact.id, contactName: contact.full_name })}>
                <Phone className="h-4 w-4 mr-1.5" />
                Ligar
              </Button>
            )}
            {contact.email && (
              <Button color="secondary" size="sm" asChild>
                <a href={`mailto:${contact.email}`}>
                  <EnvelopeSimple className="h-4 w-4 mr-1.5" />
                  Email
                </a>
              </Button>
            )}
            <Drawer open={maisOpen} onOpenChange={setMaisOpen}>
              <DrawerTrigger asChild>
                <Button color="secondary" size="sm">
                  <DotsThree className="h-4 w-4" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="pb-8">
                <div className="pt-3 pb-2">
                  <div className="w-9 h-1 rounded-full bg-muted-foreground/20 mx-auto mb-4" />
                  <div className="flex flex-col">
                    {permissions.canEditContacts && (
                      <button
                        onClick={() => { setMaisOpen(false); navigate(`/contacts/${contact.id}/edit`); }}
                        className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-foreground active:bg-white/[0.04]"
                      >
                        <PencilSimple className="w-5 h-5 text-muted-foreground/50" />
                        Editar contato
                      </button>
                    )}
                    <button
                      onClick={() => { setMaisOpen(false); }}
                      className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-foreground active:bg-white/[0.04]"
                    >
                      <UserPlus className="w-5 h-5 text-muted-foreground/50" />
                      Atribuir responsável
                    </button>
                    <button
                      onClick={() => { setMaisOpen(false); }}
                      className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-foreground active:bg-white/[0.04]"
                    >
                      <ArrowsLeftRight className="w-5 h-5 text-muted-foreground/50" />
                      Mover para cliente
                    </button>
                    <button
                      onClick={() => { setMaisOpen(false); }}
                      className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-foreground active:bg-white/[0.04]"
                    >
                      <Archive className="w-5 h-5 text-muted-foreground/50" />
                      Arquivar contato
                    </button>

                    <div className="border-t border-white/[0.08] my-1" />

                    {permissions.canDeleteContacts && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-destructive active:bg-white/[0.04]">
                            <TrashSimple className="w-5 h-5" />
                            Excluir contato
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('contacts.deleteConfirm')}</AlertDialogTitle>
                            <AlertDialogDescription>{contact.full_name}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => { setMaisOpen(false); handleDelete(); }}>{t('common.delete')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          {/* Horizontal scrollable tabs */}
          <div className="flex overflow-x-auto border-b border-border px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`px-3.5 py-2.5 text-[13px] whitespace-nowrap border-b-2 transition-colors ${
                  selectedTab === tab.id
                    ? 'text-primary border-primary font-medium'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto px-4 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {renderTabContent()}
          </div>
        </div>
      </MobileLayout>
    );
  }

  // ── Desktop ──
  if (orgLoading || loading) return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </Layout>
  );
  if (!contact) return <Layout><div className="p-6">{t('common.noResults')}</div></Layout>;

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="px-6 pt-4">
          <Breadcrumbs 
            items={[
              { label: t('contacts.title'), href: '/contacts' },
              { label: contact.full_name }
            ]} 
          />

          {/* Card Header com Avatar */}
          <div className="mt-6 flex items-start justify-between">
            <div className="flex items-start gap-4">
              <Avatar 
                fallbackText={contact.full_name}
                size="xl"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    {contact.full_name}
                  </h1>
                  {contact.lifecycle_stage && (
                    <Badge color={getLifecycleColor(contact.lifecycle_stage)} size="sm">
                      {contact.lifecycle_stage}
                    </Badge>
                  )}
                </div>
                {contact.email && (
                  <p className="text-sm text-muted-foreground">{contact.email}</p>
                )}
                <LeadOriginBadge contact={contact} campaign={campaign} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              
              {permissions.canEditContacts && (
                <Button color="secondary" size="sm" asChild>
                  <Link to={`/contacts/${contact.id}/edit`}>
                    <PencilSimple className="h-4 w-4 mr-2" />
                    {t('common.edit')}
                  </Link>
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button color="ghost" size="icon">
                    <DotsThreeVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {permissions.canEditContacts && (
                    <DropdownMenuItem asChild>
                      <Link to={`/contacts/${contact.id}/edit`}>
                        <PencilSimple className="h-4 w-4 mr-2" />
                        {t('common.edit')}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {permissions.canDeleteContacts && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <TrashSimple className="h-4 w-4 mr-2" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('contacts.deleteConfirm')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {contact.full_name}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>
                            {t('common.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex-1 p-6",
            selectedTab === 'messages'
              ? "overflow-hidden flex flex-col min-h-0"
              : "overflow-auto"
          )}
        >
          {/* Mobile: Native Select */}
          <NativeSelect
            aria-label="Tabs"
            value={selectedTab as string}
            onChange={(e) => setSelectedTab(e.target.value)}
            options={tabs.map((tab) => ({ label: tab.label, value: tab.id }))}
            className="w-full md:hidden mb-4"
          />

          {/* Desktop: Underline Tabs */}
          <Tabs
            selectedKey={selectedTab}
            onSelectionChange={setSelectedTab}
            className={cn(
              "w-full",
              selectedTab === 'messages' && "flex-1 flex flex-col min-h-0"
            )}
          >
            <Tabs.List type="underline" items={tabs} className="max-md:hidden">
              {(tab) => <Tabs.Item key={tab.id} {...tab} />}
            </Tabs.List>

            <Tabs.Panel id="details" className="space-y-4">
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-foreground">{t('contacts.details')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {contact.email && (
                    <div className="flex items-center gap-3">
                      <EnvelopeSimple className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">{t('contacts.email')}</div>
                        <div className="text-foreground">{contact.email}</div>
                      </div>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground">{t('contacts.phone')}</div>
                        <div className="flex items-center gap-2">
                          {hasVoiceIntegration ? (
                            <button
                              onClick={() => startCall({ 
                                phoneNumber: contact.phone, 
                                contactName: contact.full_name, 
                                contactId: contact.id 
                              })}
                              className="text-primary hover:underline cursor-pointer font-medium"
                            >
                              {formatPhoneDisplay(contact.phone)}
                            </button>
                          ) : (
                            <span className="text-foreground">{formatPhoneDisplay(contact.phone)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {contact.company_name && (
                    <div className="flex items-center gap-3">
                      <Buildings className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">{t('contacts.company')}</div>
                        <div className="text-foreground">{contact.company_name}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground">{t('contacts.owner') || 'Responsável'}</div>
                      <OwnerSelector
                        value={contact.owner_user_id}
                        onChange={async (userId) => {
                          const { error } = await supabase
                            .from('contacts')
                            .update({ owner_user_id: userId, updated_by: userProfile?.id || null } as any)
                            .eq('id', contact.id);
                          if (error) {
                            toast.error(t('common.error'));
                          } else {
                            setContact({ ...contact, owner_user_id: userId });
                            toast.success(t('contacts.updated'));
                          }
                        }}
                        size="sm"
                      />
                    </div>
                  </div>
                  {contact.created_at && (
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Criado em</div>
                        <div className="text-foreground">
                          {new Date(contact.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )}
                  {contact.updated_at && (
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Atualizado em</div>
                        <div className="text-foreground">
                          {new Date(contact.updated_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Criado por</div>
                      <div className="text-foreground">{createdByName || 'Sistema'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Atualizado por</div>
                      <div className="text-foreground">{updatedByName || 'Sistema'}</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Documentos */}
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-foreground">Documentos</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">CPF</div>
                      <div className="text-foreground">{contact.cpf || '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">RG</div>
                      <div className="text-foreground">
                        {contact.rg ? `${contact.rg}${contact.rg_issuer ? ` - ${contact.rg_issuer}` : ''}` : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Nacionalidade</div>
                      <div className="text-foreground">{contact.nationality || '—'}</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Endereço */}
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-foreground">Endereço</h2>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-foreground">
                    {contact.address_street || contact.address_city ? (
                      <>
                        {contact.address_street && <div>{contact.address_street}</div>}
                        {contact.address_neighborhood && <div>{contact.address_neighborhood}</div>}
                        <div>
                          {[contact.address_city, contact.address_state].filter(Boolean).join(' - ')}
                          {contact.address_zip && ` · CEP ${contact.address_zip}`}
                        </div>
                      </>
                    ) : '—'}
                  </div>
                </div>
              </Card>

              {/* Origem do Anúncio (CTWA) */}
              {contact.ad_referral_source_id && (
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Megaphone className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Origem do Anúncio</h2>
                    <Badge color="blue" size="sm">CTWA</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contact.ad_referral_headline && (
                      <div>
                        <div className="text-sm text-muted-foreground">Título do Anúncio</div>
                        <div className="text-foreground font-medium">{contact.ad_referral_headline}</div>
                      </div>
                    )}
                    {contact.ad_referral_body && (
                      <div>
                        <div className="text-sm text-muted-foreground">Texto do Anúncio</div>
                        <div className="text-foreground">{contact.ad_referral_body}</div>
                      </div>
                    )}
                    {contact.ad_referral_source_id && (
                      <div>
                        <div className="text-sm text-muted-foreground">Ad ID (Meta)</div>
                        <div className="text-foreground font-mono text-sm">{contact.ad_referral_source_id}</div>
                      </div>
                    )}
                    {contact.ad_referral_source_url && (
                      <div>
                        <div className="text-sm text-muted-foreground">Link do Anúncio</div>
                        <a 
                          href={contact.ad_referral_source_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                        >
                          Abrir anúncio <ArrowSquareOut className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {contact.ad_referral_captured_at && (
                      <div>
                        <div className="text-sm text-muted-foreground">Capturado em</div>
                        <div className="text-foreground">
                          {new Date(contact.ad_referral_captured_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    )}
                  </div>
                  {contact.ad_referral_media_url && (
                    <div className="mt-4">
                      <div className="text-sm text-muted-foreground mb-2">Imagem do Anúncio</div>
                      <img 
                        src={contact.ad_referral_media_url} 
                        alt="Anúncio" 
                        className="rounded-lg max-w-xs max-h-48 object-cover border border-border"
                      />
                    </div>
                  )}
                </Card>
              )}

              {/* Atribuição de Marketing (UTMs / Click IDs / Meta Hierarchy) */}
              {(contact.utm_source || contact.utm_medium || contact.utm_campaign || contact.utm_content || contact.utm_term || contact.fbclid || contact.gclid || contact.meta_adset_id || contact.meta_campaign_id || contact.meta_lead_id || contact.referrer_url || contact.landing_url) && (
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Megaphone className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Atribuição de Marketing</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      ['utm_source', contact.utm_source],
                      ['utm_medium', contact.utm_medium],
                      ['utm_campaign', contact.utm_campaign],
                      ['utm_content', contact.utm_content],
                      ['utm_term (ad_id)', contact.utm_term],
                      ['fbclid', contact.fbclid],
                      ['gclid', contact.gclid],
                      ['meta_adset_id', contact.meta_adset_id],
                      ['meta_campaign_id', contact.meta_campaign_id],
                      ['meta_lead_id', contact.meta_lead_id],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label as string}>
                        <div className="text-sm text-muted-foreground">{label}</div>
                        <div className="text-foreground font-mono text-sm break-all">{value as string}</div>
                      </div>
                    ))}
                    {contact.fbclid_captured_at && (
                      <div>
                        <div className="text-sm text-muted-foreground">fbclid capturado em</div>
                        <div className="text-foreground text-sm">
                          {new Date(contact.fbclid_captured_at).toLocaleString(locale)}
                        </div>
                      </div>
                    )}
                    {contact.referrer_url && (
                      <div className="md:col-span-2">
                        <div className="text-sm text-muted-foreground">Referrer URL</div>
                        <div className="text-foreground text-sm break-all">{contact.referrer_url}</div>
                      </div>
                    )}
                    {contact.landing_url && (
                      <div className="md:col-span-2">
                        <div className="text-sm text-muted-foreground">Landing URL</div>
                        <div className="text-foreground text-sm break-all">{contact.landing_url}</div>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </Tabs.Panel>


            <Tabs.Panel id="timeline">
              <ActivityTimeline contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="opportunities">
              <ContactOpportunities contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="tasks">
              <ContactTasks contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="notes">
              <ContactNotes contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="calls">
              <ContactCalls 
                contactId={contact.id} 
                contactPhone={contact.phone}
                contactName={contact.full_name}
              />
            </Tabs.Panel>

            <Tabs.Panel id="messages" className="mt-4">
              <ContactConversations contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="attachments">
              <ContactAttachments contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="documents">
              <DocumentChecklist contactId={contact.id} />
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
```

---

## 10. Incertezas e pendências

- `[INCERTO]` Existência de índice único em `tag_assignments (tag_id, entity_id, entity_type)`. Verificar antes de habilitar toggle otimista.
- `[INCERTO]` Origem exata dos itens da tab `notes` — provavelmente `activities` com `activity_type = note`, confirmar em `ContactNotes.tsx`.
- `[TODO]` Helper de máscara/validação de CPF e RG — não existe no repo. Definir com produto antes de bloquear save por CPF inválido.
- `[TODO]` Auto-preenchimento de endereço por CEP (ViaCEP) — não implementado hoje.
- `[TODO]` CRUD de `communication_endpoints` no mobile — bloqueado por RLS `is_org_admin`; se necessário no mobile, precisa de fluxo admin dedicado.
