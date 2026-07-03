# P1 — Template em massa cria thread nova em vez de reabrir thread existente

**Status:** Parcialmente corrigido (2026-07-03)
**Origem:** Batch merge de threads duplicadas (2026-07-03) — identificado como
principal fonte de duplicatas repostas ao longo do tempo.

## Bug

O fluxo de envio de template criava uma nova `message_thread` em vez de
reabrir/reusar uma existente com a mesma chave lógica:

- `organization_id`
- `contact_id`
- `channel`
- `primary_endpoint_id`
- `business_context`

Consequência: cada envio de template para um contato com thread `resolved`
gerava um novo par (winner/loser) que só era detectado no próximo batch de
consolidação.

## Correção aplicada nesta iteração

### 1. Edge function `supabase/functions/meta-whatsapp-send/index.ts`

Fallback quando o payload NÃO traz `threadId` (linhas ~261-315):

- Filtra `merged_into_thread_id IS NULL` (nunca reusar um loser consolidado).
- Filtra `primary_endpoint_id = endpoint.id` (nunca colapsar threads de
  endpoints diferentes do mesmo contato).
- Inclui threads `resolved`/`closed` na busca; se encontrada, reabre
  (`status = 'open'`, `resolved_at = null`) antes de reutilizar.
- Só cria thread nova quando **nenhuma** thread bate a chave lógica.
- Ao criar, seta `primary_endpoint_id` para evitar duplicatas silenciosas.

### 2. Edge function `supabase/functions/twilio-whatsapp-send/index.ts`

Fallback legado quando o payload NÃO traz `threadId` (linhas ~632-707) —
mesmo patch:

- Exclui losers consolidados.
- Quando o caller passou `endpointId` explícito, exige match por
  `primary_endpoint_id`.
- Reabre `resolved`/`closed` em vez de duplicar.
- Ao criar, seta `primary_endpoint_id` quando disponível.

## O que AINDA falta (fora deste repo)

### 3. Railway backend — `POST /api/whatsapp/send`

O `whatsappService.sendTemplate` (em `src/services/whatsapp.ts`) faz POST
para o backend Node hospedado no Railway
(`https://seialz-backend-production.up.railway.app/api/whatsapp/send`).

Esse handler cria a `message_thread` do lado dele e é a **origem principal**
das duplicatas observadas no batch de merge (o `SendTemplateModal` do CRM e
provavelmente automações externas usam esse endpoint).

**Ação necessária no Railway:**

Aplicar o mesmo padrão da correção nas edge functions:

1. Antes de criar `message_thread`, buscar por `(organization_id, contact_id,
   channel, primary_endpoint_id, business_context)` com
   `merged_into_thread_id IS NULL`, sem filtrar status.
2. Se existir `resolved`/`closed`, reabrir (`status = 'open'`, `resolved_at
   = null`) e usar.
3. Só criar nova se nenhuma casar.
4. Ao criar, sempre setar `primary_endpoint_id` e `business_context`.

Enquanto isso não for feito no Railway, o `SendTemplateModal` continuará
recriando duplicatas nesse caminho — mesmo que a auditoria/merge deste
codebase esteja limpa.

## Prevenção estrutural (aguardar 24h+ pós-fix Railway)

1. Monitorar `duplicates by (org, contact, channel, primary_endpoint_id,
   business_context)` — deve permanecer em **0**.
2. Se estável por 24-72h, avaliar constraint UNIQUE parcial:
   ```sql
   CREATE UNIQUE INDEX CONCURRENTLY ux_message_threads_logical_key
     ON public.message_threads (organization_id, contact_id, channel,
                                primary_endpoint_id, business_context)
     WHERE merged_into_thread_id IS NULL;
   ```
   ⚠️ NÃO criar antes do fix Railway — quebraria o fluxo de template em
   produção.
3. Depois disso, limpeza física dos losers arquivados via
   `message_thread_merge_audit.loser_snapshot`/`winner_snapshot`.
