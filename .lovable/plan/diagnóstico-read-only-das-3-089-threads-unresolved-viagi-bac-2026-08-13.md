# Diagnóstico READ-ONLY das 3.089 threads UNRESOLVED (Viagi) — backfill de `messages.endpoint_id`

Nenhum write executado. Flag `conv_route_resolver_v2` continua OFF. Atendimento intocado. Sem Fase 3.

## Resultado central

**Não existe lacuna de `endpoint_id` para backfillar.** A lacuna é de **histórico inbound**, não de coluna nula.

Fatos medidos na Viagi (`b246ef6f-…d2896a`):

- Threads sales/whatsapp ativas: **6.866**; sem inbound roteável: **3.089** (45%).
- Mensagens inbound da org (total): **27.144** — com `endpoint_id` nulo: **0**.
- Mensagens inbound dentro das 3.089 threads: **0**.
- Mensagens totais nas 3.089 threads: **6.080** — sendo **6.068 outbound** (6.067 já com `endpoint_id`) e **0 inbound**.
- 3.074 threads são **outbound-only**; **15** threads não têm nenhuma mensagem (mas têm `last_inbound_at` preenchido, resíduo de denormalização/merge).
- `integration_inbound_events` da org: 35.730 registros, mas **`resulting_message_id` nulo em 100%** e **0 eventos ligados aos contatos dessas 3.089 threads** → não serve como fonte 1:1.
- Não existe `whatsapp_message_sid` nem `metadata` em nenhuma inbound dessas threads (não existem inbounds).

## Classificação pedida

| Classe | Threads | Mensagens a backfillar | Observação |
|---|---|---|---|
| **A) BACKFILL_SEGURO** | **0** | **0** | Não há inbound com `endpoint_id` nulo em nenhum lugar da org; nada a preencher |
| **B) SEM_EVIDENCIA** | **3.074** | 0 | Threads outbound-only: nunca houve inbound, logo não existe endpoint receptor a provar |
| **C) AMBIGUO** | **15** | 0 | Threads sem mensagem alguma; o contato tem inbound roteável em **outra** thread — evidência cross-thread, não 1:1 por mensagem |

Como A = 0, os itens pedidos para A (breakdown por endpoint histórico, fonte 1:1, query de validação, SQL de backfill) não se aplicam: não há linha `messages` inbound com `endpoint_id IS NULL`. Qualquer preenchimento exigiria **criar** mensagens inbound inexistentes ou inferir por `primary_endpoint_id`/Route única — ambos proibidos pelo contrato.

Contexto informativo (não usado como evidência): o `primary_endpoint_id` dessas 3.089 threads distribui-se em …5098 (2.682), …2890 (360), …8439 (47), e os outbounds saíram por …5098 (5.637), …8439 (241), …2890 (189). Fica registrado apenas para mostrar de onde vinha o número "resolvido" do PRE-FLAG antigo — **proibido usar**.

## Simulação pós-backfill

```text
RESOLVEM_ATUAL      = 3777
BACKFILL_SEGURO     = 0
RESOLVEM_PROJETADO  = 3777
UNRESOLVED_RESTANTE = 3089
AMBIGUOS            = 15
SEM_EVIDENCIA       = 3074
FALLBACK_PRIMARY_ENDPOINT = 0
```

O backfill determinístico **não cobre nada da lacuna**. Portanto, conforme sua própria regra de decisão, o caminho é voltar a discutir estratégia de compatibilidade — não backfill.

## Leitura operacional do risco real (para a decisão)

Das 3.089 threads, todas nunca receberam inbound. Em WhatsApp isso significa que já hoje elas estão **fora da janela de 24h** e só poderiam receber template aprovado; não há conversa livre em curso a ser interrompida. O impacto de ligar a flag é bloquear **novas iniciativas outbound** nessas threads até a primeira inbound chegar (que já grava `endpoint_id` corretamente e resolve a thread daí em diante).

## Próximo passo proposto (a decidir por você, nada implementado)

Escolher uma das compatibilidades para threads legadas sem inbound, mantendo o contrato V2 intacto para threads com inbound:

1. **Fail-closed puro** (contrato como está): `REPLY_ROUTE_UNRESOLVED` nas 3.089; operação escolhe a linha explicitamente na UI ao iniciar contato. Zero inferência.
2. **Seleção explícita de Route pelo operador**, persistida como decisão auditada por thread (campo/registro próprio, nunca lido de `primary_endpoint_id`), consumida pelo resolver como "rota escolhida por humano" e não como fallback.
3. **Congelar legado**: threads sem inbound viram somente-leitura para envio; contato novo abre thread nova já com endpoint explícito.

Recomendo (2) se a operação precisa continuar prospectando nessas 3.089 threads, porque é a única que não infere nada e mantém rastreabilidade.

## Detalhes técnicos

- Universo: `message_threads` com `organization_id = Viagi`, `business_context='sales'`, `channel='whatsapp'`, `merged_into_thread_id IS NULL`.
- Critério de UNRESOLVED (fiel ao runtime): não existe `messages` com `direction='inbound' AND endpoint_id IS NOT NULL AND deleted_at IS NULL` na thread.
- Fontes de evidência avaliadas e descartadas: `messages.whatsapp_message_sid`, `messages.metadata`, `integration_inbound_events` (`resulting_message_id`, `resulting_contact_id`), `message_thread_merge_audit` (não contém endpoint por mensagem).
