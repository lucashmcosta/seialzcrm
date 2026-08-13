# Hotfix — inbound WhatsApp Comercial sem descarte silencioso

## Causa raiz (refinada, confirmada em código)

O caminho canônico **já existe** e já é compartilhado pelos três webhooks (`_shared/sales-thread.ts` → `resolveSalesWhatsappThread`), chamado por Meta (linha 843), Twilio (~872) e Evolution (~645). O contrato dele já é exatamente o aprovado: `org + contact + whatsapp + business_context='sales' + merged_into_thread_id IS NULL`, com `primary_endpoint_id` fora da identidade.

O problema é o **gate**: `_shared/sales-canonical-gate.ts` só libera o caminho canônico quando a feature flag `conv_route_resolver_v2` está habilitada **para a organização**. A flag está ON somente para a Viagi. Já a trigger `trg_zz_guard_sales_thread_canonical` é **global, sem escopo de org**.

Resultado para a Central Trabalhista (40ae935c…): gate nega (`flag_off`) → caminho legado busca por `primary_endpoint_id = endpoint` → a thread canônica `9c158663…` tem `primary_endpoint_id NULL` → não encontra → tenta INSERT → trigger bloqueia (`SALES_THREAD_DUPLICATE_BLOCKED`) → `no_thread_id` → mensagem descartada com HTTP 200.

Ou seja: guarda global + lookup canônico escopado por flag = janela de descarte para toda org fora da flag.

## Correção

### 1. Desacoplar o lookup de inbound da feature flag

No gate, separar duas decisões:

- **inbound (identidade da conversa)**: passa a exigir apenas (1) endpoint Comercial e (2) Route Comercial V2 válida. **Sem** condição de flag — porque a trigger que bloqueia duplicidade também não é escopada por flag.
- **outbound / resolver V2**: continua exigindo a flag, inalterado.

Implementação: nova função exportada `salesCanonicalInboundEnabled()` no mesmo módulo (condições 1 e 2), mantendo `salesCanonicalPathEnabled()` como está para quem depende dela. Os três webhooks passam a usar a variante de inbound no ponto de resolução de thread.

Isso satisfaz os itens 1 e 2 do pedido sem duplicar lógica nova de lookup — o lookup canônico correto já é o que `resolveSalesWhatsappThread` faz.

### 2. Recuperação de corrida (`SALES_THREAD_DUPLICATE_BLOCKED`)

Em `resolveSalesWhatsappThread`, no INSERT: ao receber erro `P0001` cuja mensagem contém `SALES_THREAD_DUPLICATE_BLOCKED`, **refazer o SELECT canônico** e reutilizar a thread. O UUID da mensagem de erro não é usado como fonte — só como sinal para relookup. Se o relookup também falhar, retorna erro (que agora vira falha explícita, ver item 3).

### 3. Durabilidade do evento (nunca 200 + perda)

Nos três webhooks, quando o evento é válido, org/contato resolvidos, mas a persistência da mensagem falha:

- gravar o evento em `integration_inbound_events` com `process_status='failed'` e `process_error` (schema atual já tem `raw_payload`, `raw_headers`, `process_status`, `process_error`, `integration_slug`, `request_path`, `idempotency_key`) — trilha recuperável, sem mudança de schema;
- Meta: manter `200` **apenas** se a trilha foi gravada com sucesso; se nem a trilha gravar, responder `500` para a Meta reentregar.
- Twilio: idem, com TwiML vazio no caminho de sucesso e `500` quando não há trilha.
- Evolution: idem.
- Handshake/verificação (`GET hub.challenge`) permanece **byte-a-byte inalterado**.

### 4. Auditoria Twilio / Evolution

Ambos já chamam o mesmo helper canônico e já são cobertos pela mudança do gate. Nenhuma reescrita de lookup neles — apenas a troca do gate para a variante de inbound e o fail-safe do item 3. Evidência do estado atual será registrada no relatório.

### 5. Métricas antes/depois (read-only)

Antes do deploy e depois: threads canônicas `sales/whatsapp` com `primary_endpoint_id IS NULL`; com primary divergente do endpoint histórico das mensagens; contagem de `SALES_THREAD_DUPLICATE_BLOCKED` e `no_thread_id_after_lookup_and_insert` nos logs por provider; duplicidades `sales/whatsapp`. Esperado depois: zero novos descartes.

### 6. Evento do João Teste

O payload não foi enfileirado (Meta usa escrita direta) e o log de edge function só guarda a linha de erro, sem corpo. Vou verificar se sobrou payload em qualquer trilha antes de concluir; se não houver, registro como **perdido** e a validação será feita com um novo inbound real seu.

### 7. Endpoint +551150287020 (`407ff93d…`)

Somente diagnóstico: por que está `is_active=false/status=offline`, se o número segue na integração Meta, se a subscription entrega webhook e se a desativação foi intencional. **Nenhuma alteração.**

## QA

Testes Deno em `supabase/functions/_shared/` cobrindo T1–T10 com um stub de banco: canônica com primary NULL, canônica com primary de outro endpoint, loser nunca selecionado, criação única, recuperação de corrida, fail-safe de durabilidade, contrato idêntico nos três providers, e Atendimento inalterado (gate nega em `purpose != sales/commercial`). Suite existente (66 testes) roda junto.

## Não será tocado

Trigger de canonicidade, resolver V2 de envio, merge/unmerge, Routes, `active_endpoint_id`, Atendimento, Mobile, feature flags (valor), Fase 3 manager, UI.

## Entrega

Bloco final com `META_CANONICAL_LOOKUP`, `TWILIO_CANONICAL_LOOKUP`, `EVOLUTION_CANONICAL_LOOKUP`, `LOSER_NEVER_SELECTED`, `RACE_RECOVERY`, `INBOUND_DURABILITY`, `ATENDIMENTO_REGRESSION`, `DUPLICIDADES_SALES_WHATSAPP`, `EVENTO_JOAO_RECUPERAVEL`, `ENDPOINT_7020_DIAGNOSTICO`, `BLOQUEADORES`.

## Ponto que precisa da sua confirmação

Remover a flag da condição de **inbound** significa que o caminho canônico de ingest passa a valer para **todas as orgs** (inclusive Central Trabalhista) imediatamente — que é exatamente o que a trigger global já assume. A alternativa mais conservadora seria escopar a correção só à Central; ela deixaria as demais orgs fora da flag ainda expostas ao mesmo descarte. O plano acima segue a opção global, alinhada ao contrato aprovado.
