
# Limpeza manual do Atendimento — Central Trabalhista

Org `40ae935c-…-91be6404a95f`. Janela de inatividade: **20 dias** (nada mexido nas regras/RPCs).

## Números do escopo do Inbox hoje

Escopo = a mesma regra do `rpc_inbox_queue_counts` (business_context='customer_service' OU customer/CS-endpoint), status `open + in_progress + awaiting_client`.

| Bucket | Total |
|---|---:|
| Total no escopo | **5.156** |
| Sem mensagem há 20+ dias | **5.021** |
|  ↳ `awaiting_client` | 3.480 |
|  ↳ `open` | 1.541 |
|  ↳ lifecycle = `lead` | 5.000 |
|  ↳ lifecycle = `customer` | 21 |
|  ↳ contato com oportunidade **won** | 21 |
|  ↳ contato **sem** oportunidade won | 5.000 |
| Órfãs sem endpoint (`purpose/provider NULL`) | 2 (1 já stale) |

Verificação separada: os **569 contatos com oportunidade `won` já estão com `lifecycle_stage = 'customer'`** — 0 precisam promoção. Ou seja, não há reclassificação de contato a fazer nesta rodada.

## O que vai ser limpo (manual, uma execução, sem tocar em regras)

Duas ações independentes, aplicadas em ordem:

### Ação 1 — Preservar clientes reais
- Alvo: threads em escopo, stale 20d, cujo contato **tem `won`** (21 threads, todas já `customer`).
- **Não** resolver. Ficam como estão — são histórico de cliente ativo. Apenas registradas no log de auditoria como "mantidas".

### Ação 2 — Resolver threads inativas de lead
- Alvo: threads em escopo, `status IN ('open','in_progress','awaiting_client')`, `last_message_at < now() - interval '20 days'`, contato **sem** oportunidade `won`.
- Quantidade estimada: **5.000 threads** (3.459 awaiting_client + 1.541 open).
- Update aplicado:
  - `status = 'resolved'`
  - `resolved_at = now()`
  - `resolved_reason = 'auto_cleanup_inactivity_20d_2026_07'`
  - `resolved_by_user_id = NULL` (limpeza de sistema)
- Efeito na UI: some da aba "Ativos/Aguardando"; não aparece em "Concluídos hoje" só por causa do fuso? Aparece sim (`resolved_at = now()`), mas some no dia seguinte. Contato mantém o histórico completo.

### Ação 3 — Órfãs sem endpoint
- 2 threads sem `primary_endpoint_id` válido; 1 delas já stale.
- Mesmo tratamento da Ação 2, motivo `auto_cleanup_orphan_endpoint_2026_07`.

## Execução

1. **Snapshot pré-limpeza** para rollback:
   ```sql
   CREATE TABLE _backup_ct_inbox_cleanup_2026_07 AS
   SELECT id, status, resolved_at, resolved_reason, resolved_by_user_id, updated_at
   FROM message_threads WHERE id IN (<alvos>);
   ```
2. **Dry-run**: rodar o `SELECT` que gera a lista de IDs e conferir a contagem (5.000 + 1 + 21-de-controle).
3. **Update em lote** (em transação, uma única query com `IN (SELECT …)`).
4. **Verificação pós**: recontar `rpc_inbox_queue_counts` — esperado `waiting` cair de ~5.1k para a ordem de ~140–180 (as ~135 threads com atividade nos últimos 20 dias + os 21 clientes com won preservados).
5. **Rollback pronto**: `UPDATE message_threads SET status=b.status, resolved_at=b.resolved_at, resolved_reason=b.resolved_reason FROM _backup_ct_inbox_cleanup_2026_07 b WHERE message_threads.id=b.id;`

## O que NÃO estamos fazendo agora (intencional)

- Não alterar `business_context` de nenhuma thread (fica como está no histórico).
- Não mudar `lifecycle_stage` de contato — os 569 won já são `customer`, e leads ficam como lead.
- Não alterar o RPC de escopo do Inbox, nem definição das abas.
- Não criar cron/regra de auto-resolve. Isso é conversa separada, depois desta limpeza.
- Não tocar em threads com atividade nos últimos 20 dias, mesmo que pareçam órfãs — ficam para revisão manual pontual.

## Perguntas de confirmação antes de rodar

1. Confirma janela **20 dias** medida por `last_message_at` (e não por `updated_at`/`assigned_at`)?
2. Ok usar `resolved_reason = 'auto_cleanup_inactivity_20d_2026_07'` como marcador? Facilita rollback e auditoria depois.
3. Quer que eu gere um **CSV com os 5.000 IDs alvo** em `/mnt/documents/` antes do update, para você conferir uma amostra?
