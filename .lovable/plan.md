# Diagnóstico — inbound Meta (Central Trabalhista) não chegou ao Comercial

Read-only. Nada foi alterado.

## Veredito

O evento chegou, foi autenticado e processado — e **parou na etapa de resolução da conversa**: o webhook não encontrou a thread canônica, tentou criar uma nova thread e foi **bloqueado pela trigger de canonicidade** (`SALES_THREAD_DUPLICATE_BLOCKED`). Sem `thread_id`, a mensagem **não foi persistida**. Logo, o banner "Sem inbound recente" está correto do ponto de vista do banco: **não existe inbound registrado** — a mensagem foi descartada antes da gravação.

Não é falha da Meta, nem do resolver V2 de envio, nem da UI.

## Caminho completo do evento (com o ponto exato de parada)

| Etapa | Resultado | Evidência |
|---|---|---|
| 1. Meta entregou o webhook? | SIM — 1 POST | edge log `POST | 200 | .../meta-whatsapp-webhook` às 06:17 UTC |
| 2. `meta-whatsapp-webhook` executou? | SIM | boot + `POST` com `signature_match: true`, `phone_number_ids: ["1248455741664884"]`, `via: per_integration` |
| 3. Assinatura/organização/endpoint resolvidos? | SIM | `inbound_settings resolved` → endpoint `bf04ce63…` (= **+551150287067**, Comercial CT, ativo) |
| 4. Contato localizado? | SIM | `contact_id c90e9e78…` (João Teste Silva, +5511964298621) |
| 5. Conversa localizada? | **NÃO — parou aqui** | `no_thread_id_after_lookup_and_insert` |
| 6. Criação de thread nova | **BLOQUEADA** | `thread_insert_error P0001 SALES_THREAD_DUPLICATE_BLOCKED … existing_thread_id=9c158663…` |
| 7. Mensagem persistida? | NÃO | 0 mensagens desse contato nas últimas 24h em `messages` |
| 8. Enfileirada em `integration_inbound_events`? | NÃO | Meta ainda usa o caminho legado de escrita direta (ADR-0004); a fila só tem eventos `evolution_api` |
| 9. Resolver V2 descartou? | NÃO se aplica | resolver V2 é do **envio**; não participa do inbound |
| 10. Retentativa da Meta? | NÃO | webhook devolveu **200**, então a Meta considera entregue — evento perdido definitivamente |

## Causa raiz (mecânica)

`supabase/functions/meta-whatsapp-webhook/index.ts` (~linha 858) busca a thread com:

```
organization_id = … AND contact_id = … AND channel = 'whatsapp'
AND primary_endpoint_id = <endpoint do webhook>
```

A thread canônica desse contato (`9c158663-a1d0-4ae8-a983-0c9653148c0e`, `sales`/`whatsapp`, `open`) tem **`primary_endpoint_id = NULL`** — ela foi a vencedora da consolidação do grupo "Joao Teste" e nunca recebeu endpoint primário. As duas perdedoras (que tinham `primary_endpoint_id = 407ff93d…`) estão com `merged_into_thread_id` apontando para ela.

Resultado: filtro por `primary_endpoint_id` não casa → lookup vazio → INSERT de nova thread → trigger `trg_zz_guard_sales_thread_canonical` bloqueia (comportamento correto e desejado) → função segue sem `thread_id` e aborta o ingest.

Ou seja: a guarda de canonicidade está certa, mas o webhook Meta **não foi adaptado** ao mundo canônico — ele ainda assume "1 thread por endpoint" e não tem fallback para a thread canônica ativa do contato.

## Sobre "os dois números"

Só **um** webhook chegou na janela: o do `phone_number_id 1248455741664884` → endpoint **+551150287067** (ativo). Nenhum POST correspondente ao segundo número. O outro endpoint Meta comercial da CT (`+551150287020`, `407ff93d…`) está **`is_active = false` / `status = offline`** — mensagem para ele não gera webhook processável (assinatura/subscription do número não está entregando). Isso é um segundo achado, independente do bloqueio acima.

## Escopo do impacto

Qualquer contato cuja thread canônica `sales/whatsapp` tenha `primary_endpoint_id` NULL ou diferente do endpoint receptor entra no mesmo beco: inbound Meta silenciosamente descartado com 200. Isso inclui, potencialmente, todas as threads vencedoras da consolidação e as threads legadas outbound-only. **Recomendo quantificar isso antes de qualquer correção** (consulta read-only) — está no próximo passo proposto.

## Próximo passo proposto (ainda sem escrever código)

1. Quantificar o universo em risco: threads canônicas `sales/whatsapp` ativas com `primary_endpoint_id` NULL ou ≠ do endpoint que costuma receber.
2. Decidir o contrato de lookup do inbound Meta (uma das opções, a definir com você):
   - lookup em duas fases: primeiro `primary_endpoint_id = endpoint`, depois **thread canônica ativa do contato** (`merged_into_thread_id IS NULL`, `business_context = 'sales'`), sem criar nada;
   - e/ou tratar `SALES_THREAD_DUPLICATE_BLOCKED` reaproveitando o `existing_thread_id` que a própria exceção já informa.
3. Definir se, na falha de resolução, o webhook deve **parar de responder 200** (para a Meta reentregar) ou gravar em `integration_inbound_events` como trilha de recuperação.
4. Avaliar separadamente o endpoint `+551150287020` (inativo) — se deve receber inbound ou ficar desligado de propósito.

Nada disso será implementado sem sua aprovação explícita. Não toquei em Atendimento, Mobile, flag, trigger ou resolver.
