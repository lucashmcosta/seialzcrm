## Plano v2 — Re-rota lazy Comercial → Meta 7020 (persistência no backend)

Roteamento no dispatcher (cliente + servidor). Persistência (UPDATE da thread + nota interna) **apenas em `meta-whatsapp-send` via service role**, após Graph aceitar. Nenhum UPDATE em `communication_endpoints`. `/inbox` intocado.

### Constantes
- `ORG_CT = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'`
- `META_7020_ENDPOINT_ID = '407ff93d-4860-49cd-82ae-beda456c1774'`
- `MIGRATION_NOTE_KIND = 'endpoint_migration_meta_7020'`
- `MIGRATION_KIND = 'commercial_twilio_to_meta_7020'`
- Texto da nota: `"Conversa migrada para o novo número WhatsApp 7020 (Meta Cloud). Histórico anterior preservado."`

---

### Alteração 1 — `src/lib/dispatchWhatsAppSend.ts` (cliente)

Adicionar campo opcional ao `WhatsAppSendPayload`:
```ts
migrationContext?: {
  kind: string;
  previousProvider: 'twilio';
  targetEndpointId: string;
  noteKind: string;
  noteText: string;
};
```

Após `resolveProvider(...)`, antes de invocar:

```ts
const SHOULD_REROUTE =
  payload.senderContext === 'messages' &&
  payload.organizationId === ORG_CT &&
  (resolved.provider === 'twilio' || resolved.source === 'default') &&
  payload.endpointId !== META_7020_ENDPOINT_ID &&
  !!payload.threadId; // sem threadId não há o que migrar/anotar

if (SHOULD_REROUTE) {
  console.log('[dispatch-wa] re-route commercial → meta 7020', {
    threadId: payload.threadId,
    previousSource: resolved.source,
  });
  payload = {
    ...payload,
    endpointId: META_7020_ENDPOINT_ID,
    migrationContext: {
      kind: MIGRATION_KIND,
      previousProvider: 'twilio',
      targetEndpointId: META_7020_ENDPOINT_ID,
      noteKind: MIGRATION_NOTE_KIND,
      noteText: 'Conversa migrada para o novo número WhatsApp 7020 (Meta Cloud). Histórico anterior preservado.',
    },
  };
  resolved = { provider: 'meta_cloud_api', source: 'endpoint_explicit' };
}
```

Cliente **não** faz UPDATE em `message_threads` nem INSERT de nota. Apenas anexa `migrationContext` e despacha.

### Alteração 2 — `supabase/functions/_shared/dispatch-whatsapp-send.ts` (servidor)

Mesma lógica de re-rota e mesmo `migrationContext` anexado. Caso server-side (AI agent / scheduled) envie com `senderContext='messages'` + `organizationId=ORG_CT` em thread Twilio, também redireciona para Meta 7020 e dispara persistência.

### Alteração 3 — `supabase/functions/meta-whatsapp-send/index.ts`

Após o envio à Graph retornar OK (mensagem aceita, com `wamid`/id), **dentro da mesma invocação**, se `payload.migrationContext` veio:

```ts
let migration_applied = false;
let migration_persistence_error: string | null = null;

if (payload.migrationContext && payload.threadId) {
  try {
    // 1) UPDATE primary_endpoint_id (idempotente)
    const { error: updErr } = await supabaseService
      .from('message_threads')
      .update({ primary_endpoint_id: payload.migrationContext.targetEndpointId })
      .eq('id', payload.threadId)
      .neq('primary_endpoint_id', payload.migrationContext.targetEndpointId);
    if (updErr) throw new Error(`thread_update_failed: ${updErr.message}`);

    // 2) Nota interna idempotente
    const { data: existing, error: selErr } = await supabaseService
      .from('messages')
      .select('id')
      .eq('thread_id', payload.threadId)
      .eq('direction', 'internal_note')
      .contains('metadata', { kind: payload.migrationContext.noteKind })
      .limit(1)
      .maybeSingle();
    if (selErr) throw new Error(`note_lookup_failed: ${selErr.message}`);

    if (!existing) {
      const { error: insErr } = await supabaseService.from('messages').insert({
        organization_id: payload.organizationId,
        thread_id: payload.threadId,
        contact_id: payload.contactId ?? null,
        direction: 'internal_note',
        content: payload.migrationContext.noteText,
        metadata: {
          kind: payload.migrationContext.noteKind,
          previous_provider: payload.migrationContext.previousProvider,
          migration_kind: payload.migrationContext.kind,
        },
      });
      if (insErr) throw new Error(`note_insert_failed: ${insErr.message}`);
    }

    migration_applied = true;
  } catch (e) {
    migration_persistence_error = (e as Error).message;
    console.error('[meta-whatsapp-send] migration persistence failed', {
      threadId: payload.threadId,
      error: migration_persistence_error,
    });
  }
}

return new Response(JSON.stringify({
  ...existingResponseBody,
  migration_applied,
  migration_persistence_error,
}), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
```

Política de erro:
- **Envio à Graph falhou** → retorna erro como hoje. `migrationContext` ignorado. Nada persiste.
- **Envio OK, persistência OK** → `migration_applied: true`, `migration_persistence_error: null`.
- **Envio OK, persistência falhou** → resposta 200 com a mensagem enviada (não desfaz envio), mas com `migration_applied: false` e `migration_persistence_error: "<motivo>"`. Log `console.error` no servidor para alerta. Próximo envio na mesma thread re-tenta automaticamente (gate ainda dispara porque `primary_endpoint_id` continua Twilio/NULL).

Todas as operações usam o `supabase` client já criado em `meta-whatsapp-send` com `SUPABASE_SERVICE_ROLE_KEY` (service role, bypassa RLS).

### Alteração 4 — Schema de validação do payload em `meta-whatsapp-send`

Adicionar `migrationContext` como objeto opcional no schema de validação existente (Zod ou equivalente). Sem isso o validador rejeita o campo extra.

---

### O que NÃO muda
- `communication_endpoints` — nenhum UPDATE. `purpose` do 7020 permanece `customer_service`.
- `/inbox` Atendimento/CS, `inboxScope.ts`, hooks, UI: intactos.
- As 5 threads CS no 7020 continuam visíveis em /inbox.
- Endpoint US `+16893077491`: intacto.
- Meta Lead Ads, CAPI, templates, Twilio global, contatos, oportunidades, histórico: intactos.
- `twilio-whatsapp-send`: não recebe `migrationContext`, não muda.
- Cliente não toca em `message_threads` nem em `messages` para esse fluxo. Não depende de RLS.

### Critérios de validação

**A — Thread antiga Twilio em /messages (Central Trabalhista):**
- Log cliente: `[dispatch-wa] re-route commercial → meta 7020`.
- Resposta da edge: `migration_applied: true`, `migration_persistence_error: null`.
- `SELECT primary_endpoint_id FROM message_threads WHERE id=…` → `407ff93d…1774`.
- `SELECT * FROM messages WHERE thread_id=… AND direction='internal_note' AND metadata->>'kind'='endpoint_migration_meta_7020'` → exatamente 1 linha.
- Última `messages` outbound: `metadata.meta_cloud` presente, `metadata.twilio` ausente, `whatsapp_status` em `sent|delivered|read`.

**B — Reenvio na mesma thread (já migrada):**
- Gate `false` (provider já é `meta_cloud_api`), `migrationContext` não é anexado.
- Resposta da edge: `migration_applied: false` (ou ausente). Nota **não** duplica.

**C — Thread CS em /inbox:**
- `senderContext='inbox'` → gate `false`. Sem `migrationContext`. Nenhuma alteração de thread/nota. Comportamento idêntico ao atual.

**D — Thread Twilio de outra org:**
- `organizationId !== ORG_CT` → gate `false`. Nada muda.

**E — Persistência falhando (simular ao colocar `threadId` inválido após envio OK):**
- Resposta: `migration_applied: false`, `migration_persistence_error` preenchido. Mensagem enviada normalmente. Re-tenta no próximo envio.

### Ordem de execução
1. Você aprova este plano.
2. Editar `src/lib/dispatchWhatsAppSend.ts` (Alteração 1).
3. Editar `supabase/functions/_shared/dispatch-whatsapp-send.ts` (Alteração 2).
4. Editar `supabase/functions/meta-whatsapp-send/index.ts` (Alterações 3 + 4) — deploy automático.
5. Validar cenários A–E com 1 thread piloto Twilio antes de uso amplo.
6. Rollback = reverter os 3 arquivos. Nenhum dado de schema a desfazer; threads já migradas permanecem em Meta 7020 (não é regressão, é estado final desejado por thread).

### Arquivos tocados
- `src/lib/dispatchWhatsAppSend.ts`
- `supabase/functions/_shared/dispatch-whatsapp-send.ts`
- `supabase/functions/meta-whatsapp-send/index.ts`