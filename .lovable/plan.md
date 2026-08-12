# Unique Comercial × reversibilidade de merge — diagnóstico e desenho mínimo

Nada de DDL foi executado. A unique NÃO deve ser criada na forma proposta.

## A) Prova do conflito (read-only)

O conflito é real e universal, não teórico.

1. `unmerge_message_thread` restaura o loser com:
   `status = loser_prev_status`, `merged_into_thread_id = NULL`, `resolved_at = snapshot`.
   O winner permanece com `merged_into_thread_id = NULL`.
2. Consulta read-only sobre os merges SALES_V2 ativos hoje:
   **91 de 91 pares** (89 do lote + 2 do batchZ) têm winner e loser com o mesmo
   `organization_id + contact_id + channel='whatsapp' + business_context='sales'`.
   Ou seja: com a unique parcial criada, **todo unmerge SALES_V2 falharia** com
   violação de unicidade no momento de zerar `merged_into_thread_id` do loser.

Conclusão: a unique proposta e o contrato de reversibilidade aprovado são
mutuamente exclusivos como estão. Não é ajuste de predicado — é semântica.

## B) Segundo conflito encontrado (não previsto antes)

A unique também colide com o **caminho de inbound atual**, que é o gerador das
duplicidades:

- Nos 91 pares consolidados, **91/91** tinham `primary_endpoint_id` diferentes
  entre winner e loser. Zero pares com o mesmo endpoint.
- `twilio-whatsapp-webhook` procura thread por
  `(org, contact, channel, primary_endpoint_id)` e, não achando, **cria nova
  thread** para aquele número. `evolution-webhook` reaproveita a thread mais
  recente e migra o endpoint.
- Nenhum dos dois webhooks filtra `merged_into_thread_id IS NULL` ao localizar a
  thread — um inbound pode cair numa thread já consolidada (loser fechado).

Com a unique ativa e o inbound inalterado, o primeiro inbound de um segundo
número para um contato que já tem thread Comercial ativa **falha na inserção** e
a mensagem é perdida (o webhook responde 200 e loga erro).

## C) Opções de desenho

**Opção 1 — Canonicidade no ponto de nascimento (recomendada)**
- Sem unique index. Trigger `BEFORE INSERT` em `message_threads`, restrita a
  `business_context='sales' AND channel='whatsapp' AND contact_id IS NOT NULL`:
  se já existir thread Comercial ativa para `(org, contact, 'whatsapp')`,
  levanta `SALES_THREAD_DUPLICATE_BLOCKED` (erro explícito, sem heurística).
- `UPDATE` fica fora da regra → unmerge continua funcionando integralmente.
- Requer ajustar o inbound para resolver a thread canônica por
  `(org, contact, channel)` com `merged_into_thread_id IS NULL`, em vez de
  por endpoint — que é exatamente o modelo que a consolidação assumiu.
- Atendimento intocado (predicado exige `sales`).

**Opção 2 — Unique + marcador de isenção**
Coluna nova (ex. `dedup_exempt_at`) preenchida pelo unmerge e excluída do
predicado. Mantém o índice, mas o próprio índice deixa de garantir "uma thread
ativa por contato" justamente nos casos revertidos. Mais schema, menos garantia.

**Opção 3 — Unique + unmerge fail-closed**
O unmerge passaria a recusar quando o winner ainda estiver ativo. Elimina a
reversibilidade que acabamos de validar. Rejeitada.

**Opção 4 — Adiar a constraint para a Fase 3**
Sem barreira estrutural agora; apenas monitoramento de duplicidades. Não impede
novas duplicidades.

Recomendação: **Opção 1**, em duas etapas: primeiro o inbound canônico (com a
trigger em modo bloqueante já ativo, pois o inbound corrigido nunca insere
duplicata), depois avaliar a unique real na Fase 3, quando o roteamento por
Route/`messaging_lines` estiver ligado e a reversibilidade puder ser expressa por
uma coluna de ciclo de vida própria.

## D) Sequência proposta

1. Migração: trigger de canonicidade Comercial (bloqueante, só `INSERT`, só
   `sales`+`whatsapp`+`contact_id` presente).
2. Ajuste dos webhooks WhatsApp (Twilio, Evolution, Meta) para localizar a thread
   canônica por `(org, contact, channel)` com `merged_into_thread_id IS NULL`,
   fazendo backfill/migração de `primary_endpoint_id` quando o número muda, e
   nunca gravando em thread consolidada.
3. Ensaio transacional com `ROLLBACK`: merge → unmerge total e parcial com a
   trigger ativa (deve passar), inbound de segundo número (deve reaproveitar a
   thread canônica), tentativa de INSERT duplicado direto (deve falhar com
   `SALES_THREAD_DUPLICATE_BLOCKED`), Atendimento inalterado (hash de controle).
4. Só depois: testes de webhook/resolver com a flag OFF e validação de shadow.
5. Flag da Viagi e Fase 3 permanecem fora deste escopo.

## Detalhes técnicos

SQL da trigger (para revisão, ainda não aplicado):

```sql
CREATE OR REPLACE FUNCTION public.fn_guard_sales_thread_canonical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_existing uuid;
BEGIN
  IF COALESCE(NEW.business_context,'') <> 'sales'
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

CREATE TRIGGER trg_guard_sales_thread_canonical
BEFORE INSERT ON public.message_threads
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_sales_thread_canonical();
```

Observação de ordem: `business_context` é preenchido por
`fn_message_threads_autofill_business_context`. É preciso confirmar se esse
trigger é `BEFORE INSERT` e com qual nome, para garantir que a guarda rode
**depois** do autofill (a ordem entre triggers de mesmo evento é alfabética pelo
nome) — caso contrário a guarda veria `business_context` nulo e não atuaria.
Isso será verificado antes da migração.
