# Último gate da Fase 2 — trigger de canonicidade + PRE-FLAG Viagi

Escopo: persistir a trigger já ensaiada, validar, e entregar o PRE-FLAG da Viagi.
Fora de escopo: habilitar a flag, criar índice unique, Fase 3, habilitar a Central.

## 1. Persistir a trigger de canonicidade Comercial

Migração única criando:

- `public.fn_guard_sales_thread_canonical()` — `SECURITY DEFINER`, `SET search_path = public`.
- `trg_zz_guard_sales_thread_canonical` — `BEFORE INSERT ON public.message_threads FOR EACH ROW`.

Regras exatas (idênticas ao ensaio aprovado):

- Só atua quando `NEW.business_context = 'sales'` **e** `NEW.channel = 'whatsapp'` **e** `NEW.contact_id IS NOT NULL`. Qualquer outro caso: `RETURN NEW` imediato.
- **Lock transacional do contato antes da verificação** (fecha a race condition de dois inserts concorrentes):
  ```sql
  PERFORM 1
  FROM public.contacts
  WHERE id = NEW.contact_id
    AND organization_id = NEW.organization_id
  FOR UPDATE;
  ```
  Isso serializa inserts do mesmo `org + contact` até o fim da transação.
- Somente depois do lock, bloqueia se já existir thread ativa canônica do mesmo `organization_id + contact_id` em `sales/whatsapp` com `merged_into_thread_id IS NULL` (ignorando a própria linha).

- Erro: `RAISE EXCEPTION 'SALES_THREAD_DUPLICATE_BLOCKED ...'` com `organization_id`, `contact_id` e `existing_thread_id` na mensagem.
- `BEFORE INSERT` apenas — nenhum `UPDATE` é interceptado, preservando merge/unmerge, rotação de endpoint e alterações operacionais.
- Nome com prefixo `zz_` para ordenar depois das triggers de autofill de `business_context`.

Nenhuma constraint unique é criada.

## 2. Validação imediata após criar (leitura + ensaio com ROLLBACK)

Confirmações read-only:

- trigger existe, está `ENABLED`, é `BEFORE INSERT` e aponta para a função certa;
- duplicidades ativas `sales/whatsapp` = 0;
- Atendimento sem regressão: contagem de threads/mensagens `customer_service` inalterada e inserts de CS aceitos.

Smoke sintético em transação única com `ROLLBACK` no final:

| Caso | Esperado |
| --- | --- |
| a) 2ª thread `sales/whatsapp` no mesmo org+contact | `SALES_THREAD_DUPLICATE_BLOCKED` |
| b) thread `customer_service` no mesmo contato | permitida |
| c) thread com `business_context` NULL | permitida |
| d) `merge_sales_threads` + `unmerge_message_thread` (SALES_V2) no mesmo ciclo/batch | funcionam, estado operacional restaurado |
| e) 2ª thread `sales` de contato diferente | permitida |
| f) serialização da guarda | validação explícita de que o `FOR UPDATE` em `public.contacts` está no corpo final da função (`pg_get_functiondef`), mais teste de concorrência com duas sessões: a segunda fica bloqueada e, ao liberar, recebe `SALES_THREAD_DUPLICATE_BLOCKED` |


Encerra com `ROLLBACK` e prova de zero dado sintético persistido.

## 3. PRE-FLAG final da Viagi (somente leitura)

Organização Viagi: `b246ef6f-6242-4011-a112-6d8783d2896a` (existe uma segunda organização homônima `a4078c14-…` sem Route Comercial; não entra no escopo).

Itens a reconfirmar no momento do PRE-FLAG:

- `conv_route_resolver_v2` OFF e 0 organizações;
- Route Comercial ativa: line `95beef60-…` (`inbox_key = sales`, `channel = whatsapp`, `is_active`);
- `active_endpoint_id` = endpoint do número terminado em **8439**, `is_active = true`, provider suportado;
- mappings da Route: **2890**, **5098** e **8439** presentes com link ativo (o endpoint 5098 é histórico/inativo — serve apenas para descoberta da Route, conforme o contrato);
- shadow do resolver sobre as threads Comerciais da Viagi: quantas resolvem, quantas caem em `REPLY_ROUTE_UNRESOLVED`, e prova de que threads cuja última inbound roteável é 2890 ou 5098 resolvem para 8439;
- duplicidades `sales/whatsapp` = 0;
- Atendimento intacto (nenhuma thread CS entra no caminho novo).

## 4. Parada obrigatória

Se tudo verde, o trabalho para aqui e eu peço uma única autorização final para
`conv_route_resolver_v2 = ON somente para a organização Viagi`.

## Detalhes técnicos

- Uma migração, apenas `CREATE OR REPLACE FUNCTION` + `CREATE TRIGGER`; sem DDL em tabelas, sem índices.
- O shadow do resolver é executado em SQL espelhando `resolveSalesReplyRoute` (última `messages` inbound com `endpoint_id` → `messaging_line_endpoints` ativo → `messaging_lines` sales ativa → `active_endpoint_id`), sem qualquer fallback (`primary_endpoint_id`, `purpose`, provider default).
- Nenhuma alteração de código de aplicação nesta etapa; as Edge Functions já deployadas continuam com a flag OFF.
