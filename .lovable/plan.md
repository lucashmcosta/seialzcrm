## Objetivo

Desativar o endpoint Meta Cloud **+16893077491** (id `d26280e5-2d79-495b-8983-befb534b7d15`) da org Central Trabalhista, sem quebrar histórico nem deixar threads órfãs.

## Por que soft‑delete e não DELETE físico

12 mensagens já referenciam esse endpoint via `messages.endpoint_id`. Um DELETE quebraria FK ou apagaria histórico. A prática correta é desligar (`is_active=false`, `status='offline'`) — fica invisível para envio, mas o histórico permanece auditável.

## Passos

**1. Migrar threads ativas para o 7020**

Atualizar `message_threads.primary_endpoint_id` de `d26280e5-…` para `407ff93d-4860-49cd-82ae-beda456c1774` (7020) nas 2 threads que ainda apontam pra ele:

- `b13b28c0-…` — MARCOS LUIZ PEREIRA FILHO (open) — **importante**, vai continuar atendida pelo 7020
- `a304367f-…` — Joao Teste (resolved) — só por consistência

**2. Desativar o endpoint**

```sql
UPDATE communication_endpoints
SET is_active = false,
    status = 'offline',
    display_name = '+16893077491 (desativado)',
    metadata = metadata || jsonb_build_object(
      'deactivated_at', now(),
      'deactivation_reason', 'numero_teste_meta_sandbox_substituido_por_7020'
    )
WHERE id = 'd26280e5-2d79-495b-8983-befb534b7d15';
```

**3. NÃO mexer**

- 7020 (`407ff93d-…`) — intocado
- `organization_integrations.a4036195-…` — intocado (a WABA continua conectada via 7020 e via o próprio token)
- `connected_account.phone_number_id` da integração — intocado
- Twilio, Lead Ads, CAPI, templates — fora do escopo

## Efeitos esperados

- `/messages` (comercial) → continua em 7020 (já era hoje, via re‑route lazy)
- `/inbox` na thread do MARCOS → passa a sair pelo 7020
- UI Meta Cloud → endpoint some da lista "endpoints existentes" (filtra por `is_active=true`) **ou** aparece marcado como desativado se a lista incluir inativos — confirmamos depois
- Webhook inbound da Meta no phone_number_id `616542954869698` → o handler ainda resolve o endpoint pelo `sender_sid` mas vê `is_active=false`. Hoje nunca chegou inbound nesse número (0 em toda a história), então risco prático = 0. Se um dia chegar, vira log e não cria thread — comportamento aceitável para um número que estamos aposentando

## Verificação pós‑mudança (read‑only)

1. `SELECT is_active, status FROM communication_endpoints WHERE id='d26280e5-…'` → `false, offline`
2. `SELECT count(*) FROM message_threads WHERE primary_endpoint_id='d26280e5-…'` → `0`
3. `SELECT count(*) FROM message_threads WHERE id IN ('b13b28c0-…','a304367f-…') AND primary_endpoint_id='407ff93d-…'` → `2`
4. Histórico de mensagens preservado: `SELECT count(*) FROM messages WHERE endpoint_id='d26280e5-…'` → continua `12`

## Fora do escopo

- DELETE físico do endpoint
- Remover/alterar o phone_number_id na WABA pelo Meta Business Manager (isso é ação fora do app)
- Cadastrar o novo número brasileiro — fica para o próximo passo quando você passar `phone_number_id` + E.164
