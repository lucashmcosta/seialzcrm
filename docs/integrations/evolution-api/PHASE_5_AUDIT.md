# Fase 5 — Piloto Controlado (Viagi) · Relatório de Auditoria

**Data:** 2026-07-20  
**Escopo autorizado:** ativar Evolution API **exclusivamente** para a organização
Viagi (`b246ef6f-6242-4011-a112-6d8783d2896a`), com **um** endpoint, **uma**
messaging_line e **uma** instância Evolution. Nenhum outro tenant, nenhum
comportamento novo em Meta/Twilio.

---

## 1. Habilitação exclusiva do piloto

| Recurso | ID / Chave | Escopo |
|---|---|---|
| Organização piloto | Viagi — `b246ef6f-6242-4011-a112-6d8783d2896a` | única |
| Feature flag `evolution_api_enabled` | global `enabled=false` · Viagi `enabled=true` | per-org |
| `communication_endpoints` (`provider='evolution_api'`) | `11111111-e701-4a01-8000-000000000001` | 1 registro, apenas Viagi |
| `messaging_lines` (`key='evolution_pilot'`) | `22222222-e701-4a01-8000-000000000002` | 1 registro, apenas Viagi |
| `evolution_instances` | `viagi-pilot` (1:1 com o endpoint) | 1 registro |

Confirmação SQL:

- `SELECT organization_id, count(*) FROM communication_endpoints WHERE provider='evolution_api'` → **`Viagi: 1`**.
- `messaging_lines` do tenant Viagi:
  `commercial` (meta_cloud_api), `customer_service` (meta_cloud_api),
  `evolution_pilot` (evolution_api) — Comercial e Atendimento **inalterados**.

## 2. Idempotência persistente

A dedup em memória (Fase 3/4) foi **substituída** por gravação em
`integration_inbound_events` com `UNIQUE (integration_slug, idempotency_key)`.

- Chave estável:
  - `MESSAGES_UPSERT/UPDATE` → `instance|event|<message.key.id>`
  - Demais eventos → `instance|event|<date_time>`
- Reentrega retorna `200 { duplicate: true }` sem reprocessar.

Evidência após bateria de testes (11 POSTs distintos):

```
total=11 · uniq=11 · duplicatas rejeitadas por índice único
```

## 3. Processamento de eventos (Fase 5)

Apenas metadados da instância são atualizados; **nenhum** thread, contato ou
mensagem é criado nesta fase.

| Evento | Efeito colateral | `process_status` |
|---|---|---|
| `CONNECTION_UPDATE` | `evolution_instances.last_known_state`, `last_state_checked_at` | `processed` |
| `QRCODE_UPDATED` | `last_qr_expires_at` (TTL) | `processed` |
| `MESSAGES_UPSERT/UPDATE` | apenas log em `integration_inbound_events` | `received` |
| desconhecido | apenas log | `received` |
| instância não registrada | log + resposta `202 FEATURE_DISABLED` (sem efeito) | `received` |

Estado final da instância após simulação end-to-end:

```
instance_name     = viagi-pilot
last_known_state  = open
last_state_checked_at = 2026-07-20 20:06:50Z
last_qr_expires_at    = 2026-07-20 19:59:05Z  (do QR simulado)
```

## 4. Segurança e resiliência

- **Autenticação do webhook** por header `x-evolution-webhook-secret` contra
  `EVOLUTION_WEBHOOK_SECRET` (secret dedicado, distinto da global key).
  - `401 UNAUTHORIZED` para requisições sem header ou com token errado
    (validado nos testes).
- **Rate limit** in-memory: 120 req/60s por instância no webhook;
  30 req/60s por usuário no manager.
- **URL do webhook nunca sai do backend.** A UI chama `op:"webhookSet"`
  apenas com `instanceName`; o manager monta a URL final e injeta o
  segredo antes de registrar na Evolution.
- **Gate de feature flag** aplicado em duas camadas:
  1. global (bloqueia tudo quando `enabled=false`);
  2. per-org (só Viagi está habilitada).
- **JWT obrigatório** no manager; webhook é público por contrato de provedor
  e protegido pelo secret.
- Logs continuam com redação de segredos e QR base64.

## 5. Inércia sobre Meta e Twilio

- `messages` criadas via endpoint Evolution: **0**.
- `message_threads` com `primary_endpoint_id` Evolution: **0**.
- Endpoints por provider (produção):

```
evolution_api    : 1  (Viagi, piloto)
meta_cloud_api   : 6
seialz           : 2
twilio           : 16
```

- Nenhuma alteração em `messaging_lines` Comercial/Atendimento de Viagi
  ou de qualquer outro tenant.
- Nenhuma edge function Meta/Twilio foi tocada nesta fase.

## 6. Alterações de código nesta fase

- `supabase/functions/evolution-webhook/index.ts` — reescrita:
  idempotência persistente, resolução de org por `instance_name`, gate de
  flag per-org, processamento de `CONNECTION_UPDATE`/`QRCODE_UPDATED`,
  correção do domínio de `process_status` (`received | processed`).
- `supabase/functions/evolution-instance-manager/index.ts` — resolve
  `organization_id` via banco, sincroniza `evolution_instances` durante
  `create/connect/connectionState/delete`, monta a URL do webhook com o
  secret no servidor.
- `src/hooks/useEvolutionInstances.ts` — `useWebhookSet` deixa de exigir
  `url`; `useEvolutionInstances` faz refetch a cada 5 s para refletir
  estado atualizado pelo webhook.
- `src/pages/admin/AdminEvolution.tsx` — remove URL hardcoded do
  frontend.
- Migração aditiva: ampliação do `messaging_lines_key_check` para
  aceitar `'evolution_pilot'` (nenhum dado alterado; nenhum outro key
  removido).

## 7. Testes executados (produção)

```
T1  webhook sem header            → 401 UNAUTHORIZED   ✅
T2  webhook com token errado      → 401 UNAUTHORIZED   ✅
T3  CONNECTION_UPDATE connecting  → 200 processed      ✅
T4  reenvio do T3 (dedup)         → 200 duplicate      ✅
T5  QRCODE_UPDATED                → 200 processed (TTL gravado) ✅
T6  CONNECTION_UPDATE open        → 200 processed (state=open)  ✅
T7  instância não registrada      → 202 FEATURE_DISABLED (sem efeito) ✅
T8  MESSAGES_UPSERT               → 200 processed=false, apenas log ✅
T8c reenvio MESSAGES_UPSERT       → 200 duplicate      ✅
T9  evento desconhecido           → 200 known=false, apenas log ✅
T10 CONNECTION_UPDATE close       → 200 processed      ✅
T11 5 requests em rajada          → 200×5 (dentro do limite) ✅
```

Zero criação de mensagens/threads/contatos no endpoint Evolution durante
toda a bateria.

## 8. Gate para Fase 6

**Autorização concedida:** limitada estritamente à Fase 5.  
**Estado do sistema:** funcional apenas para Viagi; inerte para todos os
demais tenants.  
**Próxima etapa (a aguardar aprovação explícita):** habilitar o pipeline
de mensagens (upsert de threads/contatos/messages) para o endpoint
Evolution do piloto, com paridade de comportamento em relação a Meta/Twilio.

**Nenhuma alteração além do escopo desta fase foi realizada.**
