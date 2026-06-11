
# Patch mínimo no `integration-inbound-dispatcher` + teste de paridade batch_size=50

## Escopo
Editar apenas `supabase/functions/integration-inbound-dispatcher/index.ts`. Sem mudanças em RPC, webhook legado, `messages`, `message_threads`, `process_status`, cron ou flag permanente.

## Por que o patch é necessário
O dispatcher hoje só lê `batch_size` e delega o claim ao `rpc_claim_inbound_shadow_events`, que ordena por `received_at ASC` sem filtros. Sem patch, um batch_size=50 consumiria eventos antigos com `organization_id NULL` e fixtures `SMtest_*` — o oposto da amostra pedida.

---

## Mudança 1 — body parser aceita `filters`

Adicionar tipo e parse depois de `MAX_BATCH`:

```ts
type DispatcherFilters = {
  organization_id_not_null?: boolean;
  source_event?: string;                 // "inbound_message"
  received_after?: string;               // ISO timestamp
  exclude_message_sid_prefix?: string;   // "SMtest_"
};

let batchSize = DEFAULT_BATCH;
let filters: DispatcherFilters | null = null;

if (req.method === "POST") {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.batch_size === "number") {
    batchSize = Math.max(1, Math.min(MAX_BATCH, Math.floor(body.batch_size)));
  }
  if (body?.filters && typeof body.filters === "object") {
    filters = body.filters as DispatcherFilters;
  }
}
```

## Mudança 2 — novo caminho de claim filtrado

Substituir o bloco atual de `workerId` + `rpc_claim_inbound_shadow_events` por:

```ts
const workerId = `dispatcher-${crypto.randomUUID()}`;
let events: InboundEvent[] = [];

if (filters) {
  // (a) Pré-seleção sem efeitos colaterais
  let q = supabase
    .from("integration_inbound_events")
    .select(
      "id, organization_id, integration_slug, source_event, external_id, " +
      "raw_payload, received_at, trace_id, handler_key, shadow_mode"
    )
    .eq("integration_slug", INTEGRATION_SLUG)
    .eq("shadow_mode", true)
    .eq("process_status", "received")
    .order("received_at", { ascending: true })
    .limit(batchSize * 5); // folga para descartes

  if (filters.organization_id_not_null) q = q.not("organization_id", "is", null);
  if (filters.source_event)             q = q.eq("source_event", filters.source_event);
  if (filters.received_after)           q = q.gt("received_at", filters.received_after);

  const { data: candidates, error: candErr } = await q;
  if (candErr) {
    console.error(JSON.stringify({
      level: "error", msg: "inbox_v2.parity.filter_select_failed",
      error: candErr.message,
    }));
    return jsonResponse({ ok: false, error: "filter_select_failed" }, 500);
  }

  // (b) Filtro de prefixo de SID em memória
  const prefix = filters.exclude_message_sid_prefix;
  const filteredBySid = (candidates ?? []).filter((row) => {
    if (!prefix) return true;
    const p = (row.raw_payload ?? {}) as Record<string, unknown>;
    const sid = String(p.MessageSid ?? p.SmsMessageSid ?? "");
    return !sid.startsWith(prefix);
  });

  // (c) AJUSTE OBRIGATÓRIO #2 — excluir eventos JÁ logados em
  //     integration_inbound_dry_run_log para o mesmo handler_key.
  //     Sem isso o dispatcher pode reclaimar e bater no índice único
  //     uniq_iidrl_event_handler na hora do insert do log.
  let notLogged = filteredBySid;
  if (filteredBySid.length > 0) {
    const candidateIds = filteredBySid.map((r) => r.id);
    const { data: alreadyLogged, error: logSelErr } = await supabase
      .from("integration_inbound_dry_run_log")
      .select("inbound_event_id")
      .eq("handler_key", HANDLER_KEY)
      .in("inbound_event_id", candidateIds);
    if (logSelErr) {
      console.error(JSON.stringify({
        level: "error", msg: "inbox_v2.parity.dry_run_log_check_failed",
        error: logSelErr.message,
      }));
      return jsonResponse({ ok: false, error: "dry_run_log_check_failed" }, 500);
    }
    const loggedSet = new Set((alreadyLogged ?? []).map((r) => r.inbound_event_id));
    notLogged = filteredBySid.filter((r) => !loggedSet.has(r.id));
  }

  // (d) Claim idempotente um a um até bater batchSize ou esgotar.
  //     AJUSTE OBRIGATÓRIO #1 — a coluna correta em
  //     integration_inbound_event_claims é `claimed_by`, NÃO `worker_id`.
  for (const row of notLogged) {
    if (events.length >= batchSize) break;
    const { error: claimErr } = await supabase
      .from("integration_inbound_event_claims")
      .insert({
        inbound_event_id: row.id,
        handler_key: HANDLER_KEY,
        claimed_by: workerId,   // <-- claimed_by (não worker_id)
      });
    if (!claimErr) {
      events.push(row as InboundEvent);
    } else if (claimErr.code !== "23505") {
      console.error(JSON.stringify({
        level: "warn", msg: "inbox_v2.parity.claim_insert_failed",
        inbound_event_id: row.id, pg_code: claimErr.code, pg_message: claimErr.message,
      }));
    }
    // 23505 = colisão de unique (já reivindicado): pula silenciosamente
  }
} else {
  // Caminho legado preservado
  const { data: claimed, error: claimErr } = await supabase.rpc(
    "rpc_claim_inbound_shadow_events",
    { _batch_size: batchSize, _integration_slug: INTEGRATION_SLUG,
      _handler_key: HANDLER_KEY, _worker_id: workerId },
  );
  if (claimErr) {
    console.error(JSON.stringify({
      level: "error", msg: "inbox_v2.parity.claim_failed", error: claimErr.message,
    }));
    return jsonResponse({ ok: false, error: "claim_failed" }, 500);
  }
  events = (claimed ?? []) as InboundEvent[];
}
```

> Antes de aplicar, será feito um `read_query` de confirmação em `information_schema.columns` para `integration_inbound_event_claims` validando o nome `claimed_by`. Se houver divergência, paramos e reportamos antes de prosseguir.

## Mudança 3 — resposta
Incluir `filters_applied: filters` no JSON de retorno para auditoria. Restante do fluxo (`parseIntended`, lookups, `persistOutcome`, insert em `dry_run_log`, cleanup de claims) permanece intocado.

---

## Pré-check antes de ligar a flag

```sql
SELECT COUNT(*) AS elegiveis
FROM integration_inbound_events e
WHERE e.integration_slug='twilio-whatsapp'
  AND e.shadow_mode=true
  AND e.process_status='received'
  AND e.organization_id IS NOT NULL
  AND e.source_event='inbound_message'
  AND e.received_at > '2026-05-25 19:31:40'::timestamptz
  AND COALESCE(e.raw_payload->>'MessageSid', e.raw_payload->>'SmsMessageSid','') NOT LIKE 'SMtest_%'
  AND NOT EXISTS (
    SELECT 1 FROM integration_inbound_dry_run_log l
     WHERE l.inbound_event_id = e.id
       AND l.handler_key = 'twilio.whatsapp.parity_check.v1'
  );
```

## Execução controlada (uma única invocação)

1. Liga a flag:
   ```sql
   UPDATE integration_feature_flags
      SET enabled=true, updated_at=now()
    WHERE flag_key='inbox_v2.dispatch.twilio-whatsapp' AND organization_id IS NULL;
   ```
2. Aguardar ~2s.
3. `POST integration-inbound-dispatcher` uma única vez:
   ```json
   {
     "batch_size": 50,
     "filters": {
       "organization_id_not_null": true,
       "source_event": "inbound_message",
       "received_after": "2026-05-25T19:31:40Z",
       "exclude_message_sid_prefix": "SMtest_"
     }
   }
   ```
4. Desliga a flag imediatamente:
   ```sql
   UPDATE integration_feature_flags
      SET enabled=false, updated_at=now()
    WHERE flag_key='inbox_v2.dispatch.twilio-whatsapp' AND organization_id IS NULL;
   ```
5. Confirmar `enabled=false` via SELECT.

## Coleta de evidências
- Counters HTTP: `claimed`, `processed`, `match`, `divergent`, `legacy_missing`, `error`, `duration_ms`, `filters_applied`.
- Breakdown via `dry_run_log` (últimos 10 min, handler `twilio.whatsapp.parity_check.v1`).
- Até 5 amostras de `divergent` com `diff_summary`.
- Até 5 amostras de `error` com `pg_code`/`pg_message`/`error_type`.
- Zero side-effect:
  - `process_status` permanece `received`;
  - sem inserts/updates em `messages`/`message_threads`;
  - flag final = `false`.

## Fora de escopo
Backfill dos 26k eventos `organization_id NULL`, cron, mudança no RPC `rpc_claim_inbound_shadow_events`, webhook legado, `messages`, `message_threads`, `process_status`, flag permanente, cleanup dos novos registros em `dry_run_log`/claims.
