## Diagnóstico: badge "2890" x envio real pelo 8439

Thread analisada: Maria Julia Almeida (`+5512981591764`).

### Estado da thread
- `primary_endpoint_id` = endpoint Meta Cloud `+551150262890` (histórico original)
- Nenhuma migração de `primary_endpoint_id` foi feita — é isso que faz o header/badge continuar mostrando "2890".

### Últimas 4 mensagens outbound (todas do template "Boa tarde…")

| Horário (UTC) | `endpoint_id` da mensagem | Número real de envio | Provider real | Status | wamid |
|---|---|---|---|---|---|
| 22/07 20:41 | `11111111-…-0001` | **+5511936198439** | **evolution_api** | sent | `3EB0B01BD101397074CCD0` |
| 22/07 19:55 | `11111111-…-0001` | **+5511936198439** | **evolution_api** | failed (Connection Closed) | — |
| 22/07 19:39 | `11111111-…-0001` | **+5511936198439** | **evolution_api** | failed (Connection Closed) | — |
| 22/07 19:35 | `11111111-…-0001` | **+5511936198439** | **evolution_api** | failed (Connection Closed) | — |

### Conclusões

1. **As mensagens saíram (ou tentaram sair) pelo 8439 via Evolution API.** O `endpoint_id` gravado na linha de cada mensagem aponta para o endpoint Evolution `+5511936198439`, e o `whatsapp_message_sid` da que foi entregue é um `wamid` do Baileys (`3EB0…`), não um SID Twilio nem um `wamid` da Meta Cloud. Isso é consistente com o roteamento por linha ativa (Comercial → Evolution) que restauramos.
2. **O badge "Novo · 2890" da lista e o header "Meta Cloud API · 2890" refletem apenas o `primary_endpoint_id` histórico da thread**, que continua apontando para o Meta. Não é indicador de por onde a mensagem saiu.
3. **As 3 falhas de 19:35–19:55 têm o mesmo padrão do incidente da instância Evolution travada** (upstream 500 "Connection Closed"). A de 20:41, após você ter reiniciado no Evolution, foi entregue com sucesso pelo 8439.
4. **Divergência de UI, não de envio.** Do ponto de vista de dados, o comportamento está correto conforme a regra aprovada (thread mantém histórico no endpoint original; envio segue a linha ativa da tela). O que confunde visualmente é o badge/header ainda mostrarem o endpoint histórico sem indicar o endpoint efetivo de envio.
5. **A mensagem "Não entregue: Falha no envio"** exibida no chat corresponde exatamente às 3 linhas com `whatsapp_status='failed'` acima — falha do 8439 (Evolution), não do 2890.

### O que ainda depende de verificação externa
- Confirmar recebimento no aparelho da cliente para bater o `wamid` `3EB0B01BD101397074CCD0` (única forma independente do banco de garantir entrega real pelo 8439).

Sem alterações propostas neste plano — é apenas o diagnóstico solicitado.