# Auditoria read-only — Como o Meta pensou `vendor_personal` (número pessoal)

Somente leitura (código, migrações, funções no banco, docs). Nada foi alterado.

## 1. `vendor_personal` no Meta — origem e usos

Origem (mesma migração, mesmo bloco): `supabase/migrations/20260530010202_...sql:63-88` adiciona **juntas** em `communication_endpoints`:
`purpose` (CHECK `commercial|customer_service|vendor_personal|other`) **e** `assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL`.

Onde é lido hoje:
- `supabase/migrations/20260530173348_...sql:262-282` — `get_default_queue_for_thread(thread_id)`:
  `customer_service` → fila `customer_service`; **`vendor_personal` → fila `commercial` + `suggested_user_id = communication_endpoints.assigned_user_id`**; resto → `commercial`. Esta é a evidência mais direta da intenção: número pessoal **não** cria fila/conversa própria; entra no Comercial com o dono sugerido pelo endpoint.
- `src/lib/endpointPurpose.ts:7` — `SALES_PURPOSES = ['commercial','vendor_personal']` (mesmo pool de resposta do Comercial).
- `src/hooks/inbox/inboxScope.ts:6,20` — `EXCLUDED_PURPOSES = ['commercial','vendor_personal']`: pessoal é explicitamente **excluído** do Atendimento.
- `src/hooks/useThreadSendEndpoint.ts:42`, `src/lib/dispatchWhatsAppSend.ts:410`, `supabase/functions/_shared/dispatch-whatsapp-send.ts:240` — `commercial | vendor_personal` → linha `commercial`.
- `supabase/functions/twilio-whatsapp-send/index.ts:216,265,465` — pessoal tratado igual a comercial nos guards de janela/compliance.
- Backfill `supabase/migrations/20260703181459_...sql:62` — `vendor_personal` → `business_context = 'sales'`.
- UI Meta: `MetaAdditionalEndpointsSection.tsx:40,150` (“Pessoal (/messages)”) e `AddMetaWabaDialog.tsx:208` **expõem** `vendor_personal`; o dialog de número novo (`AddMetaWhatsAppNumberDialog.tsx`) não.
- Docs: `docs/product/channel-boundaries.md:22`, `docs/modules/messages/README.md:7`, `docs/integrations/evolution-api/ENDPOINT_PURPOSE_RULE.md:16` (“Linha pessoal de vendedor → `vendor_personal`”). **Não existe ADR dedicado.**

META_VENDOR_PERSONAL_ORIGINAL_INTENT=número de WhatsApp de um vendedor específico, operando **dentro do Comercial** (mesma fila /messages, mesmo pool de envio), com o dono identificado por `communication_endpoints.assigned_user_id`. Nunca foi desenhado como canal/inbox separado.

## 2. Thread: mesma ou separada?

Função canônica: `supabase/functions/_shared/sales-thread.ts:7-12` (comentário normativo do resolver):
`identidade da conversa = organization_id + contact_id + channel + business_context='sales'` e, textualmente, **“`primary_endpoint_id` NÃO faz parte da identidade. Ele é o último número usado”**. O lookup (linhas 98-110) filtra por `contact_id` + `business_context='sales'` + status aberto e, se o endpoint mudou, apenas **rotaciona** `primary_endpoint_id` (linhas 136-162).

Índices em `message_threads` (banco):
- `message_threads_unique_open_per_contact_endpoint` — UNIQUE `(organization_id, contact_id, channel, primary_endpoint_id)` WHERE aberto e `primary_endpoint_id IS NOT NULL`;
- `message_threads_unique_open_per_contact_legacy` — UNIQUE `(organization_id, contact_id, channel)` WHERE aberto e `primary_endpoint_id IS NULL`.

Ou seja: o **caminho legado** permite uma thread aberta por endpoint (fragmentação); o **caminho canônico V2** consolida por contato. `purpose`, `assigned_user_id` e `owner_user_id` **não** participam de nenhuma identidade nem de nenhum índice.

META_PERSONAL_EXPECTED_SAME_THREAD=YES (mesma thread Comercial do contato; o número pessoal só rotaciona `primary_endpoint_id`)

META_PERSONAL_ACTUAL_BEHAVIOR_TODAY=thread **separada e em limbo**. Dois motivos concretos: (a) `isSalesEndpoint()` (`_shared/sales-thread.ts:72-73`) só aceita `purpose ∈ {sales, commercial}` → `vendor_personal` reprova a condição 1 do gate e cai no legado, cuja unique inclui `primary_endpoint_id`; (b) o trigger atual `fn_message_threads_autofill_business_context` classifica qualquer purpose fora de sales/commercial/customer_service/support como **`other`**, e `other` não aparece em /messages nem em /inbox (incidente já documentado em `ENDPOINT_PURPOSE_RULE.md`).

## 3. Por que 7067 ↔ 7020 fica na mesma thread

Porque ambos os endpoints têm `purpose='commercial'`, estão vinculados por `messaging_line_endpoints` ativa à mesma Route `inbox_key='sales'` e a org tem a flag `conv_route_resolver_v2` ON — as 3 condições de `_shared/sales-canonical-gate.ts:151-160`. Com o gate liberado, o inbound usa `resolveSalesWhatsappThread`, que procura a thread por contato/contexto e só troca o `primary_endpoint_id` (rotação), sem criar thread nova.

COMMERCIAL_THREAD_KEY=`(organization_id, contact_id, channel='whatsapp', business_context='sales', status aberto)` — o endpoint é atributo mutável da thread, não chave.

## 4. Autorização do número pessoal (outbound)

Peças existentes:
- `user_reply_endpoints` (UNIQUE `organization_id, user_id, endpoint_id`) = grant explícito “usuário X pode responder por endpoint Y”.
- `fn_guard_user_reply_endpoint` (definição atual no banco): valida (1) usuário pertence à org, (2) endpoint é da org e `channel='whatsapp'`, (3) `fn_is_sales_eligible_endpoint` → endpoint ativo vinculado a Route ativa `inbox_key='sales'`. **Não** compara `NEW.user_id` com `communication_endpoints.assigned_user_id`.
- Seleção/precedência: `_shared/reply-endpoint-selection.ts` (manual > derived da última mensagem válida > `messaging_lines.active_endpoint_id`), com o servidor como fonte de verdade; composer filtra o pool por `purpose` (`src/lib/composerEndpoint.ts` + `SALES_PURPOSES`).

META_PERSONAL_OUTBOUND_AUTH_MODEL=mesma thread + vários endpoints possíveis + **autorização por grant em `user_reply_endpoints`** (o número pessoal apareceria no “Responder por” somente de quem tem grant). A intenção era exatamente essa; o que **falta** é a regra que amarra o grant ao dono: hoje nada impede conceder o número pessoal do Junior para a Maria, porque `assigned_user_id` não é consultado em lugar nenhum do fluxo WhatsApp.

## 5. Visibilidade da thread

Não existe ACL por endpoint dentro da thread, nem escopo por mensagem: RLS de `message_threads`/`messages` é por organização (+ filtros de UI por `business_context`/`assigned_user_id` da thread, que é o **responsável do CRM**, não o dono do número). Nenhuma policy referencia `communication_endpoints.assigned_user_id`.

META_PERSONAL_THREAD_VISIBILITY_MODEL=conversa compartilhada (todo o time Comercial vê o histórico completo, inclusive as mensagens trocadas pelo número pessoal); a restrição é **apenas sobre qual número cada usuário pode usar para responder**.

## 6. Inbound por endpoint pessoal — intenção vs implementação

DESIGN INTENDED: `business_context='sales'` — comprovado por dois artefatos independentes: o backfill `20260703181459:62` (`'vendor_personal' → 'sales'`) e `get_default_queue_for_thread` (fila `commercial`).

CURRENT IMPLEMENTATION GAP: o trigger em produção não tem a branch `vendor_personal`; cai no `ELSIF v_purpose IS NOT NULL THEN 'other'`. Some, portanto, de /messages e de /inbox. Somado ao `isSalesEndpoint()` que não reconhece `vendor_personal`, é **incompletude do modelo pessoal** (nunca finalizado) — não uma decisão de separar o canal.

## 7. `communication_endpoints.assigned_user_id`

ASSIGNED_USER_ID_INTENT=dono operacional do número (criada na mesma migração de `vendor_personal`, com FK para `users` e `ON DELETE SET NULL`; consumida por `get_default_queue_for_thread` como `suggested_user_id`).

ASSIGNED_USER_ID_META_USAGE_TODAY=**nenhuma**. `meta-whatsapp-connect` grava só `purpose` (linhas 626 e 1014); a busca por `assigned_user_id` fora de contatos/threads só retorna as funções de telefonia (`telephony-*`). Nem inbound nem outbound de WhatsApp leem a coluna, e não há trigger validando org/atividade do usuário apontado.

## 8. `messaging_lines.owner_user_id`

Adicionada em `supabase/migrations/20260812044651_...sql:8-11` (Fase 1 — Routes V2), nullable, **sem backfill** (o backfill só preencheu `inbox_key`/`route_slug`) e **sem nenhum leitor** em código ou função. É placeholder de “Route pessoal”, posterior ao desenho Meta de 2026-05.

OWNER_USER_ID_ORIGINAL_INTENT=marcar uma Route como pertencente a um usuário (ideia exploratória da Fase 1 Routes), nunca ativada.

PERSONAL_LINE_REQUIRED_BY_META_DESIGN=NO — o desenho Meta é **endpoint pessoal dentro da Route Comercial compartilhada**, com autorização por usuário. Criar Routes pessoais no Evolution seria escopo novo, não continuidade do desenho.

## 9. Cenário concreto (pelo desenho Meta original)

Contato João; endpoints: 7067 e 7020 Comercial compartilhados, 9999 pessoal do Junior (`assigned_user_id=Junior`), 8888 pessoal da Maria.

| Evento | Thread | Quem vê | Quem pode responder com qual número |
|---|---|---|---|
| João envia para 7067 | thread Comercial única de João (`business_context='sales'`), `primary_endpoint_id=7067` | todo o time Comercial | qualquer vendedor por 7067/7020; Junior também por 9999; Maria também por 8888 |
| Junior responde por 9999 | **mesma** thread; `primary_endpoint_id` rotaciona para 9999 | todo o time | idem acima (o pessoal não “trava” a conversa) |
| João responde para 9999 | **mesma** thread (identidade não usa endpoint); derived passa a apontar 9999 | todo o time | Junior por 9999; outros por 7067/7020 ou pelo próprio pessoal |
| Maria abre a conversa | mesma thread, histórico completo visível | todo o time | Maria por 7067/7020/8888 |
| Maria tenta usar 9999 | mesma thread | — | **bloqueado** (sem grant em `user_reply_endpoints`; deveria ser recusado também por `assigned_user_id ≠ Maria`) |
| Maria responde por 8888 | mesma thread; rotaciona para 8888 | todo o time | permitido (é o pessoal dela) |

## 10. Resultado

- META_VENDOR_PERSONAL_ORIGINAL_INTENT=número pessoal do vendedor dentro do Comercial, dono em `assigned_user_id`
- META_PERSONAL_EXPECTED_SAME_THREAD=YES
- META_PERSONAL_ACTUAL_BEHAVIOR_TODAY=thread separada e em limbo (`business_context='other'`, fora de /messages e /inbox), pois `vendor_personal` não é reconhecido por `isSalesEndpoint()` nem pelo trigger de contexto
- COMMERCIAL_THREAD_KEY=`organization_id + contact_id + channel + business_context='sales'` (+ status aberto); endpoint não é chave
- META_PERSONAL_OUTBOUND_AUTH_MODEL=mesma thread, múltiplos endpoints, grant por usuário em `user_reply_endpoints` (sem amarração ao dono hoje)
- META_PERSONAL_THREAD_VISIBILITY_MODEL=thread compartilhada; restrição só no número de resposta; sem ACL por endpoint/mensagem
- ASSIGNED_USER_ID_INTENT=dono do número pessoal / sugestão de responsável
- ASSIGNED_USER_ID_META_USAGE_TODAY=nenhuma (Meta não grava; WhatsApp não lê; sem validação)
- OWNER_USER_ID_ORIGINAL_INTENT=placeholder de Route pessoal na Fase 1 Routes, nunca usado
- PERSONAL_LINE_REQUIRED_BY_META_DESIGN=NO
- META_PERSONAL_IMPLEMENTATION_STATUS=PARTIAL (constraint, coluna de dono, pool de purposes, exclusão do Atendimento e fila sugerida existem; roteamento, gravação do dono, autorização por dono e UI não existem)

**Conclusão: A** — o desenho original do Meta era **MESMA THREAD + restrição de endpoint por usuário**. A hipótese B (thread separada) é contrariada pelo resolver canônico, pelo backfill `vendor_personal → sales` e por `get_default_queue_for_thread`; a única separação observada hoje vem da unique legada por `primary_endpoint_id`, que é justamente o comportamento que o V2 substitui.

### O que falta para terminar o modelo A corretamente (sem implementar agora)

1. **Reconhecer `vendor_personal` como Comercial no inbound**: incluir `vendor_personal` em `isSalesEndpoint()` (`_shared/sales-thread.ts`) — passa a condição 1 do gate e a conversa cai na thread canônica.
2. **Trigger de contexto**: `fn_message_threads_autofill_business_context` mapear `vendor_personal → 'sales'` (alinha ao backfill de 2026-07-03 e tira a thread do limbo).
3. **Gravar o dono**: provisionamento (Meta e Evolution) preencher `communication_endpoints.assigned_user_id` quando `purpose='vendor_personal'`, com validação de que o usuário pertence à org e está ativo.
4. **Amarrar autorização ao dono**: `fn_guard_user_reply_endpoint` recusar grant quando o endpoint é `vendor_personal` e `NEW.user_id <> assigned_user_id`; e criar o grant do dono automaticamente no provisionamento.
5. **Vínculo de Route**: o endpoint pessoal precisa entrar em `messaging_line_endpoints` da Route `sales` (é o que `fn_is_sales_eligible_endpoint` exige) — **sem** criar Route pessoal e **sem** virar `active_endpoint_id` (número ativo do time continua sendo escolha explícita).
6. **UI**: expor “Pessoal” + seleção obrigatória de usuário no fluxo de novo número (Meta já tem o valor em dois dialogs; Evolution não tem nada), e o “Responder por” listar o pessoal apenas para o dono (já sai de graça do grant).
7. **Não mexer** em: threads/endpoints existentes, `owner_user_id` de `messaging_lines`, Atendimento, rotação de número ativo.

Nada será implementado antes da sua aprovação.
