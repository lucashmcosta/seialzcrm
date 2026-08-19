# Desenho final — owner sugerido para `vendor_personal`

Somente desenho. Nada implementado.

## A única decisão nova

Uma função SQL determinística, sem efeitos colaterais:

`public.fn_resolve_inbound_suggested_assignee(_organization_id uuid, _endpoint_id uuid) returns uuid`
- retorna `communication_endpoints.assigned_user_id` **apenas** quando: endpoint pertence à org, `is_active`, `purpose = 'vendor_personal'`, `assigned_user_id NOT NULL` e esse usuário tem `user_organizations.is_active = true` na mesma org;
- em **qualquer** outro caso retorna `NULL` (inclui todo endpoint `commercial`/`sales`/CS → NULL sempre).

Ela é chamada por um único helper TS compartilhado (`_shared/inbound-assignee.ts`), usado pelos três webhooks apenas como fiação, e **somente no momento de montar o payload de INSERT de um contato novo**.

## Simplificação da auditoria (revisão pedida)

Descartado: helper TS gravando atividade (colocaria uma escrita extra no caminho do inbound) e qualquer GUC que precise atravessar chamadas PostgREST.

Proposta final, a mais simples possível:
- `trg_contacts_round_robin` (BEFORE INSERT) já é o único lugar que sabe que **sorteou**. Quando sorteia, ela marca a decisão com `set_config('app.contact_owner_source', 'round_robin', true)` — escopo **transacional local, dentro do mesmo statement de INSERT**, lido pelo trigger AFTER do mesmo comando. Nunca atravessa requisições, nunca é setado pelo cliente, nada a configurar no PostgREST.
- `trg_contacts_round_robin_audit` (AFTER INSERT) escolhe o texto:
  - marca presente → "Atribuição automática / Contato auto-atribuído via round-robin" (texto atual, idêntico);
  - marca ausente e owner veio no payload → "Atribuição inicial / Contato atribuído ao dono do número pessoal";
  - segue valendo a heurística atual de só auditar quando não há JWT de usuário (service_role).
- O corpo inteiro do trigger de auditoria passa a ficar dentro de `BEGIN ... EXCEPTION WHEN OTHERS THEN RETURN NULL; END;`. Falha na atividade **nunca** derruba o inbound.
- Nenhuma escrita nova no caminho do inbound: continua sendo exatamente uma atividade por contato novo, só com o texto correto.

Alternativa considerada e rejeitada: inferir a origem comparando o owner com donos de endpoints pessoais — ambíguo quando o mesmo usuário também venceria o sorteio.

## Confirmações

```text
ROUND_ROBIN_LOGIC_CHANGED= NO (assign_round_robin, ordem, elegibilidade e last_assigned_at intocados; trg_contacts_round_robin ganha apenas a marcação da própria decisão, sem alterar quem é escolhido)
THREAD_ASSIGNMENT_LOGIC_CHANGED= NO
OPPORTUNITY_ASSIGNMENT_LOGIC_CHANGED= NO
EXISTING_CONTACT_FLOW_CHANGED= NO
EXISTING_THREAD_FLOW_CHANGED= NO
META_FLOW_CHANGED= NO (só fiação: passa endpointId ao helper e inclui owner_user_id no INSERT quando houver sugestão)
TWILIO_FLOW_CHANGED= NO (idem)
EVOLUTION_FLOW_CHANGED= NO (idem)
PERSONAL_ENDPOINT_OWNER_CAN_NEVER_OVERRIDE_EXISTING_OWNER= YES
PERSONAL_ENDPOINT_OWNER_ONLY_AFFECTS_NEW_CONTACT= YES
ROUND_ROBIN_REMAINS_FALLBACK= YES
```

## Fluxo

```text
inbound (Meta | Twilio | Evolution)
  → resolve endpoint (inalterado)
  → contato existe?
       SIM → nada muda: mantém owner_user_id; nenhuma sugestão é consultada;
              thread canônica reutilizada por resolveSalesWhatsappThread (não escreve assigned_user_id);
              oportunidade herda o owner do contato
       NÃO → helper chama fn_resolve_inbound_suggested_assignee(org, endpoint_id)
                retornou user_id (endpoint pessoal com dono válido)
                   → INSERT do contato já com owner_user_id = user_id
                     → trg_contacts_round_robin vê owner preenchido e faz RETURN NEW (round-robin NÃO entra)
                     → auditoria grava "atribuído ao dono do número pessoal"
                retornou NULL (endpoint compartilhado, sem dono, dono inativo/fora da org)
                   → INSERT do contato SEM owner_user_id (payload idêntico ao de hoje)
                     → trg_contacts_round_robin roda o round-robin atual
                     → auditoria grava o texto atual de round-robin
  → thread: trg_threads_round_robin herda o owner do contato (código atual, sem mudança)
  → oportunidade: owner_user_id = owner do contato (sem mudança)
```

## Diff conceitual

```text
ANTES
  contato novo (qualquer endpoint)
    INSERT contacts { ...dados } (sem owner_user_id)
      BEFORE trg_contacts_round_robin → assign_round_robin(org) → owner_user_id
      AFTER  trg_contacts_round_robin_audit → "Contato auto-atribuído via round-robin"
    thread herda owner do contato
    oportunidade herda owner do contato

DEPOIS
  contato novo por endpoint COMPARTILHADO (commercial/sales/CS)
    → bit-a-bit igual ao ANTES (sugestão = NULL, payload igual, mesmo texto de auditoria)

  contato novo por endpoint vendor_personal COM dono válido   ← ÚNICA diferença
    INSERT contacts { ...dados, owner_user_id = dono do número }
      BEFORE trg_contacts_round_robin → RETURN NEW (não sorteia, não toca last_assigned_at)
      AFTER  auditoria → "Contato atribuído ao dono do número pessoal"
    thread herda owner do contato (mesmo caminho)
    oportunidade herda owner do contato (mesmo caminho)

  contato novo por endpoint vendor_personal SEM dono válido
    → bit-a-bit igual ao ANTES
```

Escopo excluído: reatribuição de contato/thread existente, permissão de resposta (já pronta), Route/fila/thread pessoal, backfill, qualquer UPDATE em registros atuais. Validação antes do commit: ensaio em transação com ROLLBACK cobrindo os três casos do diff e a regressão do texto de round-robin.
