# Plano: target_entity em Lead Form Questions

Permite mapear cada pergunta do formulário Meta Lead Ads para o **contato** ou para uma **oportunidade**, evitando duplicação de contatos quando a mesma pessoa volta com novo caso.

## 1. Migration — `lead_form_questions.target_entity`

```sql
ALTER TABLE lead_form_questions
  ADD COLUMN target_entity text NOT NULL DEFAULT 'contact'
  CHECK (target_entity IN ('contact', 'opportunity'));

CREATE INDEX idx_lead_form_questions_target_entity
  ON lead_form_questions (lead_form_id, target_entity);
```

Default `'contact'` mantém compatibilidade com mapeamentos existentes.

## 2. Edge function `meta-lead-ads-process-lead`

Refatorar a seção de mapeamento para rodar em **dois passes** (contato + oportunidade):

- Buckets separados: `contactStandard` / `oppStandard`, `contactCustomFields` / `oppCustomFields`, `contactTags` / `oppTags`.
- Loop sobre `questions` decide bucket via `q.target_entity` (fallback `'contact'`).
- Estratégias `standard_field`, `custom_field`, `tag`, `note`, `ignore` preservadas — só muda o bucket de destino.
- Pós-loop:
  1. **Contato**: usa `contactStandard` para nome/email/phone, dedup, insert/update, custom fields (`module='contacts'`), tags (`entity_type='contact'`) — lógica atual mantida, só renomeando referências.
  2. **Oportunidade (condicional)**: criar se `hasOppMappings` OU `settings.auto_create_opportunity === true`.
     - Skip com warning se faltar `default_pipeline_stage_id` (não falha o lead).
     - Title: `oppStandard.title` ou fallback `"{fullName} — {lead_form_name}"`.
     - Insert em `opportunities` com `source='meta_lead_ads'` e `source_external_id=lead.id`.
     - Custom fields com `module='opportunities'`, tags com `entity_type='opportunity'`.
- **Activity**: uma única row no contato, com `opportunity_id` linkado quando opp foi criada.
- Idempotência preservada via `source_external_id` (skip de lead já processado retorna antes).

## 3. Frontend — `QuestionMappingCard.tsx`

Adicionar **RadioGroup "Onde gravar essa resposta?"** acima do select de estratégia, com opções:
- **Contato** — dados pessoais (nome, email, telefone)
- **Oportunidade** — do caso específico (tipo, valor, prazo)

Ao trocar `target_entity`, resetar `mapped_to_contact_field`, `custom_field_definition_id`, `fixed_tag_id` (a `mapping_strategy` é agnóstica).

Sub-form condicional para `standard_field`:
- `target_entity='opportunity'` → opções: `title`, `amount`, `close_date`.
- `target_entity='contact'` → opções atuais (`full_name`, `first_name`, `last_name`, `email`, `phone`, `company_name`).

`custom_field` usa a lista vinda como prop (filtrada pelo MappingDrawer). Demais estratégias inalteradas.

## 4. Frontend — `MappingDrawer.tsx`

Substituir a query única de `custom_field_definitions` por **duas queries**: `module='contacts'` e `module='opportunities'`. Passar a lista correta para `<QuestionMappingCard customFields={...}>` baseado em `drafts[q.id]?.target_entity`.

Incluir `target_entity` no `update` da mutation `save`.

## 5. Frontend — `SettingsCard.tsx`

Atualizar texto de ajuda do switch "Sempre criar oportunidade" deixando claro que ele agora é **fallback** — se houver perguntas mapeadas para Oportunidade, a opp já é criada automaticamente.

## Fora de escopo

- `meta-lead-ads-discover` não muda (auto-mapping detecta apenas campos de contato, default `'contact'` está correto).
- `connect`, `poll`, `token-health` inalterados.
- Sem novos secrets.

## Validação pós-deploy

1. Question existente (default `contact`) continua processando como antes.
2. Question com `target_entity='opportunity'` + `standard_field='title'` → opp criada com esse título.
3. `target_entity='opportunity'` + `tag` → tag em `tag_assignments` com `entity_type='opportunity'`.
4. `target_entity='opportunity'` + `custom_field` → valor em `custom_field_values` com `module='opportunities'`.
5. Sem mapping de opp + `auto_create_opportunity=false` → não cria opp.
6. Sem mapping de opp + `auto_create_opportunity=true` → cria opp com title fallback.
7. `activities.opportunity_id` preenchido quando opp foi criada, `null` caso contrário.
8. Reprocessar mesmo `lead.id` → dedup, sem duplicar contato nem opp.
9. UI: trocar `target_entity` reseta os 3 campos específicos.
