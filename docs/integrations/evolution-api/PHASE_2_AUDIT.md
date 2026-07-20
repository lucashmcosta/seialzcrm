# Evolution API — Fase 2: Relatório de Auditoria (preparação estrutural)

Data: 2026-07-20
Escopo: preparação estrutural aditiva no banco do Seialz para suportar o
provider Evolution API. Nenhuma ativação, nenhum consumo em runtime.

Fase autorizada exclusivamente à camada de banco. Fase 3 (Edge Functions),
Fase 4 (UI) e Fase 5 (piloto Viagi) permanecem bloqueadas.

---

## 1. Migrations aplicadas

Uma única migration, aditiva:

1. **Ampliação do CHECK de `communication_endpoints.provider`**
   - Antes: `{twilio, meta_cloud_api, meta_cloud_api_coexistence, 360dialog, seialz, other}` (ou NULL).
   - Depois: idem + `evolution_api`.
   - Operação: `DROP CONSTRAINT` do CHECK antigo + `ADD CONSTRAINT` com o
     conjunto ampliado. Nenhum valor existente é alterado, invalidado ou
     rejeitado. Nenhum endpoint atual tem `provider='evolution_api'`.

2. **Criação da tabela `public.evolution_instances`**
   - Colunas de domínio: `organization_id` (FK → `organizations`, cascade),
     `endpoint_id` (FK → `communication_endpoints`, cascade, **UNIQUE** —
     garante o 1:1), `instance_name` (UNIQUE — identificador físico no
     servidor Evolution), `instance_id_remote`, `integration`
     (default `WHATSAPP-BAILEYS`), `last_known_state`,
     `last_state_checked_at`, `last_qr_expires_at`.
   - **Nenhuma coluna de credencial.** Token e apikey da instância
     permanecem exclusivamente no servidor Evolution.
   - CHECKs: `integration ∈ {WHATSAPP-BAILEYS, WHATSAPP-BUSINESS}`;
     `last_known_state ∈ {open, connecting, close, unknown}` ou NULL.
   - Índices: `(organization_id)` e `(last_known_state)`.
   - GRANTs: `authenticated` recebe `SELECT/INSERT/UPDATE/DELETE`;
     `service_role` recebe `ALL`. Sem grant para `anon`.
   - RLS habilitada com 4 políticas por operação, todas escopadas em
     `organization_id = ANY (public.current_user_org_ids())`.
   - Trigger `update_evolution_instances_updated_at` usa a função pública
     existente `public.update_updated_at_column`.

3. **Feature flag `evolution_api_enabled`**
   - Inserida em `public.feature_flags` com `is_enabled = false` e
     `organization_ids = '{}'`.
   - `ON CONFLICT (name) DO NOTHING` — idempotente.
   - Ainda **não é lida** por nenhuma parte do código (dispatcher, hooks,
     UI). Fica apenas registrada como gate.

Comentários (COMMENT ON) foram adicionados à tabela e a
`instance_name`/`last_known_state` para deixar registrado que o objeto é
inerte até a Fase 3 e que `last_known_state` **não é tempo real**.

---

## 2. Arquivos alterados

- `supabase/migrations/<timestamp>__fase2_evolution_api_schema.sql`
  (criado pelo tool de migration).
- `docs/integrations/evolution-api/PHASE_2_AUDIT.md` (este relatório).

Nenhum arquivo em `src/`, `supabase/functions/`,
`src/integrations/supabase/client.ts` ou config do projeto foi tocado.
`src/integrations/supabase/types.ts` será regenerado automaticamente pelo
Supabase — não editado manualmente.

Nenhuma Edge Function criada, alterada ou removida. Nenhum secret
adicionado, alterado ou removido. `EVOLUTION_BASE_URL` e
`EVOLUTION_GLOBAL_API_KEY` permanecem exatamente como estavam ao final da
Fase 1.

---

## 3. Impacto no schema

Aditivo em três pontos, zero pontos destrutivos:

| Objeto | Tipo | Mudança |
|---|---|---|
| `public.communication_endpoints` | Tabela existente | CHECK de `provider` **ampliado** (apenas admite mais um valor). Nenhuma coluna adicionada ou removida. |
| `public.evolution_instances` | Tabela nova | Criada, com FK cascade para `organizations` e `communication_endpoints`. |
| `public.feature_flags` | Tabela existente | Uma linha inserida (flag desligada, sem orgs). |

Não foi criada, alterada ou removida nenhuma:
- coluna em tabelas de Meta/Twilio;
- linha em `communication_endpoints`, `messaging_lines`,
  `organization_integrations`, `admin_integrations`, `integrations`;
- policy, trigger ou função em tabelas pré-existentes;
- alteração em `messaging_lines.active_endpoint_id`;
- migration destrutiva (`DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN … TYPE`,
  `TRUNCATE`).

---

## 4. Impacto em produção

**Esperado e observado: zero.**

Evidência direta consultada logo após a migration:

```
evolution_instances_rows              = 0
evolution_endpoints                   = 0   -- communication_endpoints com provider='evolution_api'
messaging_lines_pointing_to_evolution = 0
flag_enabled                          = false
flag_orgs_count                       = NULL   -- array vazio
```

Interpretação:

- Nenhuma linha foi inserida na tabela nova.
- Nenhum endpoint Evolution existe no catálogo — logo, nenhum dispatcher
  atual pode encaminhar por Evolution mesmo que quisesse.
- Nenhuma `messaging_lines.active_endpoint_id` aponta para Evolution.
- A feature flag está desligada e sem organizações habilitadas.
- Meta e Twilio continuam sendo os únicos provedores WhatsApp ativos.
  Nenhum código de `services/whatsapp.ts`, `lib/dispatchWhatsAppSend.ts`,
  `lib/resolveComposerProvider.ts` foi alterado.
- Cron/webhook/edge functions produtivos não foram tocados.

---

## 5. Flags criadas

Apenas uma:

| Nome | Estado | Organizações habilitadas | Consumida em runtime? |
|---|---|---|---|
| `evolution_api_enabled` | `is_enabled = false` | `[]` (array vazio) | Não. Nenhum consumidor no código-fonte. |

Não foi criada nenhuma entrada em `integration_feature_flags`.

---

## 6. Evidências de que nenhuma organização foi ativada

1. `SELECT is_enabled, organization_ids FROM feature_flags WHERE
   name='evolution_api_enabled'` → `false`, `{}`.
2. `SELECT count(*) FROM communication_endpoints WHERE
   provider='evolution_api'` → `0`.
3. `SELECT count(*) FROM evolution_instances` → `0`.
4. `SELECT count(*) FROM messaging_lines ml JOIN
   communication_endpoints ce ON ce.id = ml.active_endpoint_id WHERE
   ce.provider='evolution_api'` → `0`.
5. Nenhum insert em `organization_integrations`, `admin_integrations`,
   `integrations` referenciando Evolution.
6. Nenhum edge function novo — `curl_edge_functions` continuaria
   retornando apenas as funções pré-existentes.
7. A instância `dev-int` no servidor Evolution (Vultr) não foi tocada;
   Fase 2 é 100% do lado Seialz.

---

## 7. Notas do linter de segurança

O linter reportou 245 achados após a migration. Uma verificação por
amostragem mostra que todos são pré-existentes (funções sem
`search_path` fixo em tabelas antigas, extensões no schema `public`,
buckets públicos, etc.), não introduzidos por esta migration.

A tabela nova `evolution_instances`:
- tem RLS habilitada;
- tem 4 policies (uma por operação);
- não é uma função `SECURITY DEFINER`;
- não usa `USING (true)` em nenhuma operação de escrita;
- não expõe grants a `anon`.

Portanto, os achados existentes de RLS/search_path/etc. permanecem como
dívida de segurança do restante do sistema, não como regressão desta
fase.

---

## 8. Fora do escopo desta fase (reafirmado)

- Nenhum edge function Evolution definitivo criado
  (`evolution-instance-manager`, `evolution-webhook`, dispatcher etc.).
- Nenhuma alteração em `services/whatsapp.ts`,
  `lib/dispatchWhatsAppSend.ts`, `lib/resolveComposerProvider.ts`,
  hooks de composer/endpoint, ou qualquer componente de UI.
- Nenhum tenant ativado; nenhum endpoint criado; nenhuma
  `messaging_line` alterada.
- Nenhuma mudança em Meta, Twilio, `communication_endpoints` existentes
  ou na instância `dev-int` do servidor Evolution.

---

## 9. Gate para iniciar a Fase 3 (backend aditivo)

Todos abaixo devem estar verdes antes de abrir a próxima fase:

- [x] Migration aplicada com sucesso.
- [x] `evolution_instances` criada com RLS, GRANTs e 4 policies.
- [x] Feature flag `evolution_api_enabled` presente, desligada, sem orgs.
- [x] Zero linhas em `evolution_instances`.
- [x] Zero endpoints com `provider='evolution_api'`.
- [x] Zero `messaging_lines` apontando para Evolution.
- [x] Nenhum arquivo em `src/` ou `supabase/functions/` alterado.
- [ ] Aprovação explícita do owner para iniciar Fase 3.

---

## 10. Rollback (se necessário antes da Fase 3)

Reversível com uma única migration:

```sql
DROP TABLE IF EXISTS public.evolution_instances;

DELETE FROM public.feature_flags WHERE name = 'evolution_api_enabled';

ALTER TABLE public.communication_endpoints
  DROP CONSTRAINT IF EXISTS communication_endpoints_provider_check;

ALTER TABLE public.communication_endpoints
  ADD CONSTRAINT communication_endpoints_provider_check
  CHECK (
    provider IS NULL
    OR provider = ANY (ARRAY[
      'twilio'::text,
      'meta_cloud_api'::text,
      'meta_cloud_api_coexistence'::text,
      '360dialog'::text,
      'seialz'::text,
      'other'::text
    ])
  );
```

Como não há linhas em `evolution_instances` e nenhum endpoint usa
`provider='evolution_api'`, o rollback não gera perda de dados nem
viola nenhum CHECK.

---

Aguardando aprovação explícita para iniciar a Fase 3.
