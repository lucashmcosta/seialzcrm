# Fase 1 — Patch conceitual do `suvsign-webhook`

**Não aplicado ainda.** Apenas spec.

## Localização
`supabase/functions/suvsign-webhook/index.ts`

## Princípio
- Insert na Inbox v2 é **best-effort** e **NÃO** quebra o legado.
- Toda falha (exceto `unique_violation`) **DEVE** gerar log estruturado JSON + insert em `integration_inbound_ingest_errors`.
- Apenas executa se `fn_feature_flag_enabled('inbox_v2.ingest.suvsign', orgId)` for `true`.
- `shadow_mode` é gravado como `true` para garantir que dispatcher v2 não toque.

## Novo helper compartilhado
`supabase/functions/_shared/feature-flags.ts`:

```ts
// Cache em memória do isolate (TTL 60s) para evitar lookup por request.
const cache = new Map<string, { value: boolean; expiresAt: number }>();
const TTL_MS = 60_000;

export async function featureFlagEnabled(
  supabase: SupabaseClient,
  key: string,
  orgId: string | null,
): Promise<boolean> {
  const cacheKey = `${key}::${orgId ?? "global"}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabase.rpc("fn_feature_flag_enabled", {
    _flag_key: key,
    _organization_id: orgId,
  });
  const value = !error && data === true;
  cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
```

## Bloco a adicionar em `suvsign-webhook/index.ts`
Inserir **após** validação HMAC bem-sucedida e **antes** de qualquer escrita do fluxo legado:

```ts
// ============================================================
// Inbox v2 — shadow ingest (best-effort, NUNCA quebra legado)
// ============================================================
const traceId = crypto.randomUUID();
const externalId = payload?.data?.document?.id ?? payload?.event_id ?? null;
const eventType = payload?.event ?? "unknown";
const idemKey = `suvsign:${externalId ?? "no-id"}:${eventType}`;

try {
  if (await featureFlagEnabled(supabase, "inbox_v2.ingest.suvsign", orgId)) {
    const { error } = await supabase
      .from("integration_inbound_events")
      .insert({
        integration_slug: "suvsign",
        source_event: eventType,
        external_id: externalId,
        idempotency_key: idemKey,
        organization_id: orgId,
        raw_payload: payload,
        raw_headers: headersObj,
        http_method: req.method,
        request_path: new URL(req.url).pathname,
        event_version: 1,
        trace_id: traceId,
        signature_valid: true,         // HMAC já validado acima
        signature_algo: "hmac-sha256",
        source_ip: req.headers.get("x-forwarded-for") ?? null,
        headers: headersObj,
        shadow_mode: true,             // crítico: dispatcher v2 ignora
        process_status: "received",
        handler_key: "suvsign.v1",
      });

    if (error && error.code !== "23505" /* unique_violation = duplicata esperada */) {
      // Log estruturado obrigatório — NÃO engolir
      console.error(JSON.stringify({
        level: "error",
        msg: "inbox_v2.shadow_insert_failed",
        trace_id: traceId,
        integration_slug: "suvsign",
        external_id: externalId,
        event_type: eventType,
        organization_id: orgId,
        pg_code: error.code,
        pg_detail: error.details,
        pg_message: error.message,
      }));

      // Best-effort: registrar incidente (sem await bloqueante longo)
      supabase.from("integration_inbound_ingest_errors").insert({
        trace_id: traceId,
        integration_slug: "suvsign",
        external_id: externalId,
        event_type: eventType,
        organization_id: orgId,
        error_code: error.code ?? "unknown",
        error_message: (error.message ?? "").slice(0, 2000),
      }).then(
        () => {},
        () => {/* segunda falha → apenas log já acima */},
      );
    }
  }
} catch (e) {
  console.error(JSON.stringify({
    level: "error",
    msg: "inbox_v2.shadow_insert_exception",
    trace_id: traceId,
    integration_slug: "suvsign",
    external_id: externalId,
    event_type: eventType,
    organization_id: orgId,
    exception: String(e),
    stack: (e as Error)?.stack?.slice(0, 2000),
  }));
}
// ============================================================
// FIM Inbox v2 shadow — fluxo legado continua intacto a partir daqui.
// ============================================================
```

## Critérios de sucesso (Fase 1, mínimo 48h)
- `select count(*) from integration_inbound_ingest_errors where integration_slug='suvsign' and created_at > now() - interval '24h'` → **0**
- Paridade contagem Inbox vs invocações legadas: tolerância **< 1%**
- p95 latência do `suvsign-webhook` regride **< 50ms** vs baseline
- Zero 5xx adicional no webhook

## Ativação
```sql
-- Globalmente:
update public.integration_feature_flags
   set enabled = true, updated_at = now()
 where flag_key = 'inbox_v2.ingest.suvsign' and organization_id is null;

-- OU por organização específica (preferível p/ canary):
insert into public.integration_feature_flags (flag_key, organization_id, enabled)
values ('inbox_v2.ingest.suvsign', '<org-uuid>', true)
on conflict (flag_key, organization_id) do update set enabled = true;
```

## Rollback (efeito em ≤ 60s pelo cache do isolate)
```sql
update public.integration_feature_flags
   set enabled = false, updated_at = now()
 where flag_key = 'inbox_v2.ingest.suvsign';
```

Emergência: revert do edge function `suvsign-webhook` para versão anterior.
