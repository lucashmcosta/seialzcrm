
# Plano Evolution API — Correções finais + Ordem de execução

Ajustes aplicados sobre o v2. Sem código, sem migration, sem alteração em produção.

---

## 1. Correções aceitas

| # | Correção | Estado |
|---|---|---|
| 1 | Fase 0 renomeada para **"Discovery técnico controlado e reversível"** — cria/exclui instância temporária, nunca toca banco Seialz, nunca usa número real de cliente, nunca imprime API key | Aplicado |
| 2 | **Meta/Twilio permanecem textualmente inalterados no MVP.** Guard de provider fica **apenas** no dispatcher (client + server) e na nova `evolution-whatsapp-send`. Zero branch novo em `twilio-whatsapp-send`/`meta-whatsapp-send` | Aplicado |
| 3 | Removida a promessa "≤10s". Estado passa a ser **"último estado conhecido"**, atualizado por `CONNECTION_UPDATE` (se confirmado na Fase 0) + health-check background (se ausente). UI só faz polling ativo enquanto QR está aberto | Aplicado |
| 4 | Schema **inspecionado antes** de qualquer proposta de SQL — resultados abaixo | Aplicado |
| 5 | Endpoint recém-conectado nasce **`is_active=false`, `status='pending'`, `purpose='other'`** — não participa de fallback nem aparece no composer. Promoção a `is_active=true` + `purpose='commercial'|'customer_service'` só ocorre com confirmação humana | Aplicado |
| 6 | Segredo do webhook é **por instância** (secret aleatório gerado no backend, hash SHA-256 salvo em coluna dedicada; cleartext só na Evolution). Nunca reutilizar a API key admin da Evolution | Aplicado |
| 7 | Rollback registra **cada linha afetada** (`messaging_line_id`, `key`, `previous_active_endpoint_id`, `new_active_endpoint_id`, user, timestamp) em `integration_audit_logs` (tabela já existente) — sem nova tabela | Aplicado |
| 8 | Exclusão/desativação: `messaging_lines.active_endpoint_id` **é nullable** (confirmado). Fluxo: exigir substituto OU confirmação explícita → SET NULL + UI mostra "nenhum número configurado" + composer bloqueado + replies históricas seguem regra atual (`primary_endpoint_id`) | Aplicado |
| 9 | HTTPS + domínio + Manager protegido são **bloqueadores duros** do piloto Viagi. HTTP por IP só na Fase 0 | Aplicado |

## 2. Inspeção de schema — resultados

**Queries executadas** (todas retornaram — evidências no turno atual):
```sql
-- Colunas + defaults
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN
  ('communication_endpoints','messages','messaging_lines','admin_integrations','organization_integrations');
-- Constraints CHECK/UNIQUE/FK
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid IN ('public.communication_endpoints','public.messaging_lines',
                    'public.messages','public.organization_integrations','public.admin_integrations')::regclass[];
-- Índices
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname='public' AND tablename IN
  ('communication_endpoints','messages','messaging_lines','admin_integrations','organization_integrations');
```

**Achados que mudam o plano:**

**`communication_endpoints`**
- `provider` NOT NULL default `'twilio'`, CHECK atual: `twilio | meta_cloud_api | meta_cloud_api_coexistence | 360dialog | seialz | other`. → **Precisa ALTER CHECK** para incluir `evolution_api`.
- `purpose` NOT NULL default `'other'`, CHECK: `commercial | customer_service | vendor_personal | other`. **Não aceita NULL.** → endpoint pendente nasce com `purpose='other'`.
- `status` NOT NULL default `'unknown'`, CHECK: `online | offline | pending | disabled | unknown`. → pendente nasce com `status='pending'`.
- `is_active` NOT NULL default `true`. → forçar `false` na criação; UI/composer já filtra `is_active=true` (confirmado em `useOrgWhatsAppEndpoints.ts:66`).
- Índice `uq_comm_endpoints_org_channel_address` UNIQUE(`organization_id, channel, external_address`) WHERE not null — combina bem com um endpoint por número por org.
- `metadata` JSONB NOT NULL default `'{}'` — pode guardar `evolution_instance_id`, `evolution_instance_name`.

**`messages`**
- **Não existe** `external_message_id`. O campo real usado por Meta e Twilio para idempotência é **`whatsapp_message_sid`** (índice `idx_messages_wa_sid`). → Evolution grava `data.key.id` nessa coluna.

**`messaging_lines`**
- `active_endpoint_id` **é nullable** (`ON DELETE SET NULL`). → item 8 do PO viável sem migration.
- UNIQUE(`organization_id, key, channel`), `key ∈ {commercial, customer_service}` — confirma "1 linha por tela, org pode ter 2 linhas".

**`admin_integrations`**
- Colunas: `slug` UNIQUE, `name`, `status` default `'coming_soon'`, `category`, `sort_order`.
- **Não existe** `is_enabled` global. Rollback de visibilidade = `UPDATE status='coming_soon'` (some do catálogo público mas mantém row).

**`organization_integrations`**
- `is_enabled` default `false`. Nenhuma linha é criada automaticamente para tenants existentes — habilitação requer INSERT explícito por org. → Central Trabalhista fica intocada sem esforço extra.

## 3. Fase 0 — Escopo exato

**Pré-requisitos:** `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY` salvos como secrets do Supabase (nunca em arquivo, nunca em mensagem).

**Passos (todos manuais via curl, sem tocar em código Seialz):**
1. `GET /` → confirmar versão 2.3.7 e clientName.
2. `GET /instance/fetchInstances` (com `apikey`) → listar instâncias existentes; verificar que `evo_discovery_*` não colide.
3. `POST /instance/create` com `instanceName = evo_discovery_<unix_ts>_<8hex>`, `qrcode=true`, `integration=WHATSAPP-BAILEYS`, `webhook.url=<https URL de teste ou mock>`, `webhook.headers={apikey:<random>}`, `webhook.events=[MESSAGES_UPSERT,MESSAGES_UPDATE,CONNECTION_UPDATE,QRCODE_UPDATED]`. → capturar shape do QR retornado.
4. `GET /instance/connect/{name}` → confirmar refresh de QR + TTL real.
5. `GET /instance/connectionState/{name}` → mapear estados (`close|connecting|open`).
6. **Se** houver número técnico controlado autorizado pelo PO: escanear → confirmar `CONNECTION_UPDATE` chega no webhook → `POST /message/sendText` → capturar shape do payload de retorno (para `whatsapp_message_sid`) → `POST /message/sendMedia` (imagem+áudio) → observar `MESSAGES_UPSERT` chegando. **Se não houver número:** parar em `open` sem enviar.
7. `DELETE /instance/logout/{name}` → `DELETE /instance/delete/{name}` → `GET /instance/fetchInstances` confirma remoção.

**Entregável:** documento `docs/integrations/evolution-api/DISCOVERY.md` com contratos reais confirmados. Zero commit de código. Zero alteração em banco.

**Não fará:** usar número de cliente, alterar instância existente, logar API key, tocar em `messaging_lines`/`communication_endpoints`.

## 4. Arquivos que poderão ser alterados (fases 2-4)

**Novos:**
- `supabase/migrations/*_evolution_provider_and_instances.sql` (ALTER CHECK + CREATE TABLE `evolution_instances`)
- `supabase/migrations/*_seed_admin_integration_evolution.sql`
- `supabase/functions/evolution-whatsapp-webhook/index.ts`
- `supabase/functions/evolution-whatsapp-send/index.ts`
- `supabase/functions/evolution-instance-manage/index.ts`
- `supabase/functions/evolution-health/index.ts` (só se Fase 0 mostrar `CONNECTION_UPDATE` não-confiável)
- `src/components/integrations/evolution-api/*` (dialog, list, QR modal, purpose selector, substitution dialog, card)
- `src/hooks/evolution/*` (useEvolutionInstances, useEvolutionInstanceStatus, useEvolutionInstanceAction)
- `docs/integrations/evolution-api/README.md` + `DISCOVERY.md`

**Alterados (aditivos, sem tocar Meta/Twilio):**
- `src/lib/dispatchWhatsAppSend.ts` — estender `Provider` union + branch `evolution-whatsapp-send`
- `supabase/functions/_shared/dispatch-whatsapp-send.ts` — idem (paridade obrigatória)
- `src/hooks/useWhatsAppProvider.ts` — union
- `src/services/whatsapp.ts` — union
- `src/lib/resolveComposerProvider.ts` — passa Evolution direto (sem re-rota)
- `src/pages/admin/AdminIntegrations.tsx` (ou similar) — só se card exigir handler novo; provavelmente zero mudança (catálogo é data-driven)

**Explicitamente NÃO alterados no MVP:**
- `supabase/functions/twilio-whatsapp-send/index.ts`
- `supabase/functions/meta-whatsapp-send/index.ts`
- `supabase/functions/twilio-whatsapp-webhook/index.ts`
- `supabase/functions/meta-whatsapp-webhook/index.ts`
- Qualquer componente `src/components/integrations/twilio*` ou `meta-whatsapp-cloud/*`

## 5. Ordem final das fases

```
Fase 0 — Discovery Evolution (§3)          → 1 dia, zero risco
Fase 1 — Infra (domínio, HTTPS, Manager,   → depende PO/infra; bloqueia piloto
         persistência, backup, secrets)
Fase 2 — Banco aditivo                     → 2 migrations, sem tocar
                                             messaging_lines / endpoints
Fase 3 — Backend (3 edges + branches       → sem alterar Meta/Twilio
         aditivos nos 2 dispatchers)
Fase 4 — UI beta (status='beta')           → nenhum tenant ativado auto
Fase 5 — Piloto Viagi                      → snapshots pré/pós,
                                             promoção manual à linha
Fase 6 — Regressão Central Trabalhista     → diff snapshots = 0,
                                             smoke Meta em Mensagens e
                                             Atendimento, zero invocação
                                             Evolution nos logs
```

## 6. Bloqueadores restantes (antes de sair da Fase 0)

1. **Secrets Supabase:** `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY` — pedirei via `add_secret` no início da Fase 0 (formulário seguro, nunca em mensagem/arquivo).
2. **Autorização e número técnico** para o passo 6 da Fase 0 (envio real). Sem isso a Fase 0 encerra em `open` sem provar send/receive.
3. **Domínio HTTPS + Manager protegido** — bloqueadores da Fase 5. Sem infra endurecida, Fase 4 pode terminar mas Viagi não vai a produção.
4. **Confirmação na Fase 0** de: shape `webhook.headers` na v2.3.7, evento `CONNECTION_UPDATE` confiável (define se `evolution-health` entra no MVP), TTL real do QR, forma exata do QR (base64 puro vs data URL vs pairing code), campo do payload que carrega o ID externo (para gravar em `messages.whatsapp_message_sid`).

Aguardo aprovação e a liberação dos secrets/infra para iniciar a Fase 0.
