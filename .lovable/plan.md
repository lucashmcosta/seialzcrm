## Migração genérica de provider em `communication_endpoints` — versão final

### 1. Modos em `meta-whatsapp-connect`

- `mode='migrate'` — validação + UPDATE in-place.
- `mode='migrate_dry_run'` — mesmas validações, sem UPDATE. Retorna `before` e o `after` que seria escrito.

Payload (idêntico nos dois modos):

```json
{
  "mode": "migrate" | "migrate_dry_run",
  "organizationId": "…",
  "existingEndpointId": "c09bd713-…",
  "provider": "meta_cloud_api",
  "appId": "…", "wabaId": "…", "phoneNumberId": "…", "phoneE164": "+551150287027",
  "systemUserToken": "…",   // opcional — reaproveita o cifrado da integração Meta
  "appSecret": "…",         // opcional idem
  "verifyToken": "…",       // opcional idem
  "endpointPurpose": "…",   // opcional — preserva o atual
  "displayName": "…",       // opcional — preserva o atual
  "migrationReason": "provider_swap"
}
```

- A função lê o `provider` atual do endpoint; não recebe `previousProvider`.
- Hoje apenas destino `meta_cloud_api`; outros → `unsupported_target_provider`.
- Sem `migrate_rollback`.

### 2. Validação fail-closed (ordem estrita, aplicada nos dois modos)

1. JWT + membership ativa na org.
2. Endpoint existe, pertence à org, `external_address = phoneE164`, `provider` atual ≠ destino.
3. Integração `meta-whatsapp-cloud` conectada na mesma org, **mesma `waba_id`**.
4. Decifra token (novo ou armazenado).
5. Graph API (`validateCredentials`): token válido, PNID existe, `belongs_to_waba=true`, devolve `display_phone_number`, `verified_name`, `quality_rating`, `messaging_limit_tier`.
6. `display_phone_number` normalizado bate com `endpoint.external_address`.
7. Nenhum outro endpoint da org tem `sender_sid = <phoneNumberId>` (`uq_comm_endpoints_org_sender_sid`).

Qualquer falha → 4xx, zero writes.

### 3. UPDATE in-place (apenas `mode='migrate'`)

Mesma linha (`id` preservado). Alterados: `provider`, `sender_sid`, `organization_integration_id`, `external_account_id`, `status='online'`, `is_active=true`, `quality_rating`, `current_tier`, `metadata`. Preservados: `external_address`, `display_name`/`purpose` (a menos que payload mande), `organization_id`, `channel`, `assigned_user_id`, `created_at`.

### 4. `metadata.migration` + `metadata.migrations[]`

```json
{
  "migration_version": 1,
  "migration_reason": "provider_swap",
  "performed_at": "…Z",
  "performed_by_user_id": "…",
  "previous_provider": "twilio",
  "previous_sender_sid": "XE…",
  "previous_organization_integration_id": "24111d0c-…",
  "previous_external_account_id": null,
  "before": { provider, sender_sid, organization_integration_id, external_account_id, status, is_active, quality_rating, current_tier, metadata },
  "after":  { mesmos campos pós-UPDATE }
}
```

`metadata.migration` = última. `metadata.migrations` = append-only.

### 5. Resposta da função

```json
{
  "ok": true,
  "mode": "migrate" | "migrate_dry_run",
  "migrationApplied": true | false,
  "endpointId": "c09bd713-…",
  "before": { … },
  "after":  { … },   // em dry_run, o estado que seria gravado
  "meta":   { display_phone_number, verified_name, quality_rating, messaging_limit_tier }
}
```

### 6. Nota de sistema — lazy, **apenas no primeiro outbound**

- Sem backfill, sem migration nova, sem índice novo.
- **Único ponto de inserção:** `meta-whatsapp-send`, imediatamente antes do primeiro INSERT outbound da thread após a migração.
- `meta-whatsapp-webhook` **não** insere a nota e segue inalterado.
- Helper `ensureEndpointMigrationNote(supabase, threadId, endpointId)`:
  - lê endpoint; só age se `metadata.migration.migration_version >= 1`;
  - confirma que a thread já existia antes (`thread.created_at < metadata.migration.performed_at`);
  - lookup idempotente em `messages` por `thread_id` + `metadata->>'system_note_kind'='endpoint_provider_migration'` + `metadata->>'migration_endpoint_id'=<endpoint.id>`;
  - se não existir, INSERT mensagem de sistema reutilizando o renderer de divisor já existente, texto: "A partir deste ponto, este número passou a operar via Meta Cloud API. Todo o histórico anterior via Twilio foi preservado.";
  - `metadata = { system_note_kind:'endpoint_provider_migration', migration_endpoint_id, migration_version:1, from_provider, to_provider }`.

### 7. Não alterado — Twilio pós-cutover

Sem alterações em: dispatcher, composer, Railway, regras de roteamento, templates, schema do banco, `meta-whatsapp-webhook`, `twilio-whatsapp-*`.

- `twilio-whatsapp-webhook` continua deployado e **aceita callbacks residuais** (status `delivered/read/failed` de mensagens enviadas antes do cutover, retries Twilio). Resolução por `sender_sid=XE…` deixa de achar o endpoint (agora o `sender_sid` é o PNID Meta); o handler atual **já tolera** isso: loga e segue, sem falhar a requisição nem corromper dados.
- `twilio-whatsapp-send` mantém a guarda `if endpoint.provider === 'meta_cloud_api' → erro` (fail-closed): nenhum outbound vaza pelo Twilio após a migração.

### 8. Arquivos tocados

- `supabase/functions/meta-whatsapp-connect/index.ts` — branches `mode='migrate'` e `mode='migrate_dry_run'`.
- `supabase/functions/_shared/endpoint-migration-note.ts` — helper novo, compartilhado.
- `supabase/functions/meta-whatsapp-send/index.ts` — invoca helper antes do INSERT outbound.
- `src/services/metaWhatsAppService.ts` — `migrate(payload)` e `migrateDryRun(payload)` + tipo `MigrationResult { migrationApplied, before, after, … }`.
- `src/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog.tsx` — captura do 409 + sub-diálogo "Migrar este número para Meta Cloud" com botões "Simular (dry-run)" e "Migrar", exibindo diff `before/after`.

### 9. Critérios de aceitação

- `mode='migrate_dry_run'` válido: 200, `migrationApplied:false`, before/after preenchidos, **zero writes**.
- `mode='migrate'` válido: 200, `migrationApplied:true`, 1 UPDATE em `communication_endpoints`. Zero writes em outras tabelas.
- Qualquer falha de validação: 4xx, zero writes.
- Migração executada: nenhuma nota criada.
- Cliente envia mensagens após a migração: nenhuma nota criada.
- Operador responde pela primeira vez: nota aparece imediatamente antes dessa primeira mensagem outbound.
- Respostas seguintes: nenhuma nota adicional.
- Threads criadas após a migração: nunca recebem essa nota.
- Próximo envio em qualquer thread do endpoint roteia automaticamente para `meta-whatsapp-send` (dispatcher lê `provider` ao vivo).
- Callbacks Twilio residuais pós-cutover não geram erro nem corromper dados.
