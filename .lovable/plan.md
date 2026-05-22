
## Problema

O mesmo contato gera 2 oportunidades quando chega quase simultaneamente por dois canais:
- **Meta Lead Ads** (`supabase/functions/meta-lead-ads-process-lead/index.ts`) → cria opp `source='meta_lead_ads'`
- **WhatsApp Inbound** (`supabase/functions/twilio-whatsapp-webhook/index.ts`, ~linha 478) → cria opp `source='manual'` com título `"Oportunidade - {nome}"`

Nenhum dos dois consulta a tabela `opportunities` antes de criar. Resultado: contatos como Eliene e Navaha Hanan ficaram com 2 opps (mesmo `contact_id`, criadas com 20–30s de diferença).

## Regra escolhida

**Se o contato já tem qualquer oportunidade com `status='open'` (e não deletada), NÃO cria uma nova.**

## Mudanças

### 1. `twilio-whatsapp-webhook/index.ts` (auto-criação de opp no inbound)

Antes do `insert` em `opportunities`, checar:

```ts
const { data: existingOpp } = await admin
  .from('opportunities')
  .select('id')
  .eq('organization_id', organization_id)
  .eq('contact_id', contactId)
  .eq('status', 'open')
  .is('deleted_at', null)
  .limit(1)
  .maybeSingle();

if (existingOpp) {
  console.log('[wa-inbound] skip opp creation — open opp already exists', existingOpp.id);
} else {
  // insert atual
}
```

### 2. `meta-lead-ads-process-lead/index.ts` (~linha 336, dentro do `if (shouldCreateOpp)`)

Mesma checagem. Se já houver opp aberta:
- **Não cria nova.**
- Reaproveita `opportunityId = existingOpp.id` para que custom fields, tags e activity log do lead continuem vinculados à opp existente (não perdemos rastreio do form Meta).

### 3. Índice único parcial (proteção contra race condition)

Migration:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_one_open_per_contact
ON public.opportunities (organization_id, contact_id)
WHERE status = 'open' AND deleted_at IS NULL;
```

Garante que, mesmo se Meta e WhatsApp chegarem no mesmíssimo instante (a checagem em (1) e (2) passaria nos dois), o segundo `insert` falha com `23505`. Os handlers já tratam esse erro recuperando a opp existente.

## Fora de escopo

- Não mexo na deduplicação de **contatos** (`normalizePhoneForSearch`) — é outro problema.
- Não alteração de UI nem de criação manual de opps.
- Não retroativo: opps duplicadas que já existem ficam como estão (você merge manualmente se quiser).
