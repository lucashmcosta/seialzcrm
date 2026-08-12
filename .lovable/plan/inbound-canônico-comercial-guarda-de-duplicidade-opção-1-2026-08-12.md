# Inbound canônico Comercial + guarda de duplicidade (Opção 1)

Nada foi executado: sem trigger, sem DDL, sem alteração de webhook, flag OFF.
Este documento fecha o gate técnico pedido antes da implementação.

## 1) Ordem real dos triggers de `message_threads`

Triggers ativos (nenhum `BEFORE INSERT OR UPDATE` além do de endpoint):

```text
BEFORE INSERT          threads_round_robin                          -> trg_threads_round_robin
BEFORE INSERT          trg_message_threads_autofill_business_context -> fn_message_threads_autofill_business_context
BEFORE INSERT/UPDATE   trg_validate_thread_endpoint_org              -> fn_validate_thread_endpoint_org
BEFORE UPDATE          update_message_threads_updated_at             -> update_updated_at_column
AFTER  UPDATE          trg_handoff_notification, trg_log_thread_assignment_change
```

Ordem efetiva em `BEFORE INSERT` é alfabética pelo nome do trigger:
`threads_round_robin` → `trg_message_threads_autofill_business_context` →
`trg_validate_thread_endpoint_org`.

O autofill só define `business_context` quando ele vem nulo **e**
`primary_endpoint_id` está presente, derivando de
`communication_endpoints.purpose` (`sales`/`commercial` → `sales`;
`customer_service`/`support` → `customer_service`; outro valor → `other`;
`purpose` nulo → **permanece NULL**), com uma exceção datada para o endpoint
`c09bd713…`.

Consequência: uma guarda chamada, por exemplo,
`trg_zz_guard_sales_thread_canonical` rodaria depois do autofill e veria
`business_context` já preenchido. Mesmo assim, **não vamos depender de ordem
implícita**: a guarda resolve o contexto internamente com a mesma regra
(`NEW.business_context`, senão `purpose` do endpoint, incluindo a exceção
datada) e só atua quando o resultado é `sales`. O nome com prefixo `zz_`
continua sendo usado como defesa em profundidade.

Efeito colateral relevante: quando `purpose` do endpoint é nulo, a thread nasce
com `business_context` NULL — não é Comercial nem Atendimento, e fica fora da
guarda e de qualquer unique. Isso é aceito nesta fase e vale monitorar.

## 2) Fluxo atual de criação/reuso por webhook

| | Twilio | Meta Cloud | Evolution |
|---|---|---|---|
| Chave de lookup | `org + contact + channel + primary_endpoint_id`; fallback para thread com `primary_endpoint_id IS NULL` (e faz backfill) | `org + contact + channel + primary_endpoint_id`, ordenado por `last_message_at`, `limit(5)` (loga `duplicate_thread_detected`) | `org + contact + channel + primary_endpoint_id`; fallback: thread WhatsApp mais recente do contato, **migrando** `primary_endpoint_id` |
| Filtra `merged_into_thread_id IS NULL` | **Não** | **Não** | **Não** |
| Thread `resolved`/`closed` | não reabre; grava a mensagem e atualiza `last_inbound_at` | idem | idem |
| Cria nova thread quando não acha | sim, com `primary_endpoint_id` do inbound | sim | sim |
| Endpoint diferente | cria thread nova (thread por número) | cria thread nova | reaproveita e migra o endpoint (`THREAD_PROVIDER_MIGRATED`) |

Dois fatos confirmados por leitura:

- Nenhum dos três webhooks exclui threads consolidadas no lookup. Um inbound pode
  cair num loser fechado (`merged_into_thread_id` preenchido), ressuscitando a
  duplicidade e furando a contabilidade de unmerge.
- **Não existe hoje regra de reopen.** Nenhum webhook muda `status`/`resolved_at`
  da thread no inbound. Ou seja, "a regra aprovada de reopen" ainda não está
  implementada e precisa ser definida aqui (proposta no item 3).

Sobre isolamento do Atendimento: os webhooks **não leem** `purpose` nem
`business_context` — os três seguem o mesmo código, e a separação
Comercial/Atendimento acontece só no banco, via `purpose` do endpoint. Portanto o
helper canônico não pode ser aplicado por webhook, e sim **condicionado ao
`purpose` do endpoint do inbound**: `sales`/`commercial` → caminho canônico novo;
qualquer outro valor ou nulo → caminho legado byte-a-byte igual ao atual.

## 3) Contrato canônico proposto

Helper único em `supabase/functions/_shared/sales-thread.ts`, usado pelos três
webhooks somente quando o endpoint do inbound é Comercial.

Lookup: `organization_id + contact_id + channel='whatsapp' +
business_context='sales' + merged_into_thread_id IS NULL`, ordenado por
`created_at ASC` (thread canônica = a mais antiga, mesmo critério do merge).
`primary_endpoint_id` **não** entra na identidade.

Se encontrar:
- reutiliza a thread;
- se `status IN ('resolved','closed')` → reopen: `status='open'`,
  `resolved_at=NULL`, `waiting_started_at=NULL`, mais `last_inbound_at` /
  `whatsapp_last_inbound_at`, e log `SALES_THREAD_REOPENED`. Como não há regra
  anterior, esta é a regra nova a aprovar.
- `primary_endpoint_id`: adotamos a semântica **"endpoint de resposta corrente"**,
  não identidade. Motivo verificado: `_shared/dispatch-whatsapp-send.ts` lê
  `message_threads.primary_endpoint_id` para decidir por onde responder; congelar
  o campo faria a resposta sair pelo número antigo. Então ele é atualizado quando
  o inbound chega por outro endpoint, **com log explícito**
  (`SALES_THREAD_ENDPOINT_ROTATED`, com endpoint anterior e novo). O histórico de
  origem não se perde: cada mensagem carrega seu próprio `endpoint_id`, e a UI já
  renderiza o divisor de troca de número.

Se não encontrar: cria **uma** thread `sales` com o endpoint do inbound.

Atendimento e endpoints sem `purpose` seguem exatamente o fluxo atual.

## 4) Ordem de implantação (fail-safe, como você pediu)

```text
A) Deploy do helper + webhooks (Twilio, Meta, Evolution) já usando a thread
   canônica no Comercial. Sem trigger. Flag OFF. Atendimento intocado.
B) Observação com flag OFF/shadow: logs de reuso, reopen, rotação de endpoint,
   zero criação de segunda thread sales, zero gravação em thread consolidada.
C) Só então a migração da trigger de proteção (BEFORE INSERT, bloqueante).
D) Ensaio transacional com ROLLBACK: INSERT duplicado, merge, unmerge total e
   parcial, Atendimento (hash de controle).
E) Só depois discutir ligar conv_route_resolver_v2 por org (Viagi).
```

Sem unique index nesta fase; sem Fase 3.

## 5) Testes obrigatórios

Etapa B (com flag OFF, ambiente controlado):
1. inbound pelo mesmo endpoint → mesma thread;
2. inbound por outro endpoint da mesma Route → mesma thread, com
   `SALES_THREAD_ENDPOINT_ROTATED`;
3. inbound em thread `resolved` → mesma thread reaberta (`status='open'`,
   `resolved_at=NULL`);
4. loser consolidado nunca recebe mensagem nova (lookup exclui
   `merged_into_thread_id IS NOT NULL`);
5. inbound em endpoint de Atendimento → comportamento idêntico ao atual;
6. flag OFF mantém o resolver em shadow, sem decidir envio.

Etapa D (transação com ROLLBACK):
7. INSERT direto de segunda thread sales/whatsapp para o mesmo org+contact →
   `SALES_THREAD_DUPLICATE_BLOCKED`;
8. `merge_sales_threads` + `unmerge_message_thread` (total e parcial) com a
   trigger ativa → passam, pois a guarda só atua em `INSERT`;
9. INSERT de thread `customer_service` para contato que já tem thread sales ativa
   → permitido;
10. INSERT com `business_context` NULL / endpoint sem `purpose` → permitido
    (fora do escopo da guarda);
11. hash de controle das threads de Atendimento inalterado.

## Detalhes técnicos

### SQL final da trigger (etapa C, sem dependência de ordem)

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_sales_thread_canonical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx text := NEW.business_context;
  v_purpose text;
  v_existing uuid;
BEGIN
  -- resolucao propria do contexto (mesma regra do autofill), para nao depender
  -- da ordem entre triggers BEFORE INSERT
  IF v_ctx IS NULL AND NEW.primary_endpoint_id IS NOT NULL THEN
    IF NEW.primary_endpoint_id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'::uuid THEN
      v_ctx := CASE WHEN COALESCE(NEW.created_at, now()) < '2026-06-16 22:29:40+00'::timestamptz
                    THEN 'sales' ELSE 'customer_service' END;
    ELSE
      SELECT purpose INTO v_purpose FROM public.communication_endpoints
       WHERE id = NEW.primary_endpoint_id;
      IF lower(COALESCE(v_purpose,'')) IN ('sales','commercial') THEN v_ctx := 'sales'; END IF;
    END IF;
  END IF;

  IF COALESCE(v_ctx,'') <> 'sales'
     OR COALESCE(NEW.channel,'') <> 'whatsapp'
     OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.id INTO v_existing
    FROM public.message_threads t
   WHERE t.organization_id = NEW.organization_id
     AND t.contact_id      = NEW.contact_id
     AND t.channel         = 'whatsapp'
     AND t.business_context= 'sales'
     AND t.merged_into_thread_id IS NULL
     AND t.id <> NEW.id
   ORDER BY t.created_at
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'SALES_THREAD_DUPLICATE_BLOCKED (org=%, contact=%, canonical=%)',
      NEW.organization_id, NEW.contact_id, v_existing;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_zz_guard_sales_thread_canonical
BEFORE INSERT ON public.message_threads
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_sales_thread_canonical();
```

### Helper `_shared/sales-thread.ts` (etapa A)

Assinatura e responsabilidades:

```ts
export async function resolveSalesWhatsappThread(
  service: SupabaseClient,
  args: { organizationId: string; contactId: string; endpointId: string; inboundAt: string },
): Promise<{ threadId: string | null; outcome: "reused" | "reopened" | "created"; endpointRotated: boolean }>
```

- 1 select canônico (org + contact + `channel='whatsapp'` +
  `business_context='sales'` + `merged_into_thread_id IS NULL`, `created_at ASC`);
- reuso + reopen condicional + rotação de `primary_endpoint_id` com log;
- criação única quando não há canônica;
- `isSalesEndpoint(service, endpointId)` lendo `communication_endpoints.purpose`
  (com a exceção datada), para o webhook decidir entre caminho novo e legado.

### Pontos de substituição nos webhooks (etapa A)

- `supabase/functions/twilio-whatsapp-webhook/index.ts` — bloco "Find or create
  message thread" (~linhas 864-940): mantém o fluxo atual quando o endpoint não é
  Comercial; quando é, delega ao helper.
- `supabase/functions/meta-whatsapp-webhook/index.ts` — passo 6 de `handleInbound`
  (~linhas 836-900), incluindo o log `duplicate_thread_detected`.
- `supabase/functions/evolution-webhook/index.ts` — `findOrCreateThread`
  (~linhas 635-715): o atalho de "migração de provider" passa a ser a rotação de
  endpoint do helper no caminho Comercial; caminho não-Comercial inalterado.

Nenhum dos três altera contatos, oportunidades, IA ou Atendimento.

## Decisões que preciso confirmar antes da etapa A

1. Semântica de `primary_endpoint_id` = endpoint de resposta corrente
   (atualizado com log), como descrito no item 3.
2. Regra de reopen (`resolved`/`closed` → `open`, `resolved_at=NULL`), que hoje
   não existe em nenhum webhook.
3. Escopo restrito a `channel='whatsapp'` nesta fase.
