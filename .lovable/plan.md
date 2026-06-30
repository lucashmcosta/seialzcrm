## Auditoria read-only (já executada)

### Estado atual do endpoint 7020
| Campo | Valor |
|---|---|
| `id` | `407ff93d-4860-49cd-82ae-beda456c1774` |
| `external_address` | `+551150287020` |
| `purpose` | **`customer_service`** ← classificação errada |
| `channel` / `status` | `whatsapp` / `online` |
| `organization_id` | `40ae935c…` (Central Trabalhista) |

### Vizinhos (referência, NÃO serão tocados)
| external_address | id | purpose | threads | mensagens |
|---|---|---|---|---|
| `+551150287027` (Atendimento) | `c09bd713…` | `other` | 3.532 | 44.926 |
| `+16893077491` | `d26280e5…` | `customer_service` | 0 | 12 |

> Observação importante: 7027 **não está como `customer_service`**, está como `purpose='other'`. Hoje ele só entra no Inbox pela Query B (lifecycle=`customer`). Conforme instrução, não é tocado neste plano.

### Impacto da mudança em 7020

Total no 7020: **178 threads / 1.767 mensagens / 81 abertas**.

Quebra por lifecycle:

| Lifecycle | Threads | O que muda no Inbox depois de `commercial` |
|---|---|---|
| `customer` | **13** | Saem do Inbox — Query B filtra `EXCLUDED_PURPOSES=['commercial','vendor_personal']` |
| ≠ `customer` (leads etc.) | **165** | Saem do Inbox — Query C só inclui `customer_service` |

Hoje as 178 estão no Inbox via Query C (org tem `cs_inbox_includes_service_endpoints=true`). Após `purpose='commercial'`, **todas as 178 deixam o Inbox**.

Em /messages (módulo Mensagens), nada some — aquele módulo não filtra por purpose.

### "Existe uso real de 7020 como Atendimento?"

Sim, marginal: **13 threads com lifecycle=`customer`** estão usando o 7020. São as únicas que perderiam visibilidade legítima no Inbox. Lista completa (13 contatos, p.ex. MICHAEL CLEBER, SAMUEL MIRANDA, ANA KAROLINE, HUGO UBERFIL, ILTON, FLAVIANE, GUSTAVO, VIVIANE, CLEBIO, VALERIA, PAULO, Lucas Costa, MARCOS LUIZ) — 11 já estão `resolved`, 2 `open`. Disponível em SQL se quiser exportar.

Os outros 165 são leads que **não deveriam** estar no Inbox de Atendimento de qualquer forma — eles entraram só por causa da classificação errada do endpoint. Removê-los é exatamente o objetivo.

---

## Correção proposta (não executar ainda)

### Mudança única
```sql
UPDATE communication_endpoints
SET purpose = 'commercial',
    updated_at = now()
WHERE id = '407ff93d-4860-49cd-82ae-beda456c1774'
  AND external_address = '+551150287020'
  AND organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND purpose = 'customer_service';   -- guard contra alteração concorrente
```

### O que NÃO será tocado
- Endpoint 7027 (`c09bd713…`) — permanece `purpose='other'`.
- Endpoint +16893077491 (`d26280e5…`) — permanece `customer_service`.
- Nenhuma thread, contato, mensagem ou `thread_assignment_history`.
- Nenhum `primary_endpoint_id` em `message_threads`.
- Flag `cs_inbox_includes_service_endpoints` da org permanece `true`.

### Validação pós-UPDATE (read-only)
1. `SELECT purpose FROM communication_endpoints WHERE id='407ff93d…'` → `commercial`.
2. Recontar Inbox da org: 178 threads do 7020 desaparecem; contadores das abas `active/waiting/resolved_today` caem proporcionalmente.
3. `/messages` continua listando as 178 threads (sem filtro de purpose).
4. Dany (`91a0e76d…`) some do Inbox e continua acessível em /messages.

### Resultado final esperado
- **7020 = Comercial / Mensagens** (purpose=`commercial`, fora do Inbox)
- **7027 = Atendimento / Inbox** (purpose=`other`, threads `customer` continuam entrando via Query B — sem alteração neste plano)

### Observação para plano futuro (fora deste escopo)
Após o UPDATE, as 13 threads `customer` legítimas em 7020 perdem visibilidade no Inbox. Se forem reais atendimentos pós-venda, o plano correto é **migrar essas 13 threads para o 7027** (ou abrir thread nova lá), não reverter a classificação do 7020. Não faz parte deste plano.
