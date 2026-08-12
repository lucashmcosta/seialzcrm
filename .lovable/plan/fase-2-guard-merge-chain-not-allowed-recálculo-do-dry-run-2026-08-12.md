# Fase 2 — Guard `MERGE_CHAIN_NOT_ALLOWED` + recálculo do dry-run

Escopo mínimo: proibir merge encadeado na `merge_sales_threads`, manter `unmerge_message_thread` intacto, revalidar por testes sintéticos e recalcular o dry-run real. Nenhum merge real será executado.

## Decisão adotada

Consolidação comercial sempre em estrela: um winner raiz por grupo (thread mais antiga) recebendo todos os losers diretamente.

```text
permitido            proibido
   B ─┐                C ─→ B ─→ A
   C ─┼─→ A
   D ─┘
```

## Mudança única na função

Adicionar, junto às validações já existentes de `merge_sales_threads` (antes de qualquer escrita):

- se existir registro em `message_thread_merge_audit` com `winner_thread_id = p_loser` e `unmerged_at IS NULL`, então `RAISE EXCEPTION 'MERGE_CHAIN_NOT_ALLOWED'`.

Como toda a função roda numa única transação, a exceção não deixa alteração parcial — isso já foi comprovado pelo teste de rollback (T6) da rodada anterior.

Nada mais muda: precedência de status, provenance, auditoria, histórico de responsável e `unmerge_message_thread` permanecem exatamente como estão.

## Bateria de testes sintéticos (dados descartados no final)

1. A+B simples — continua PASS.
2. Grupo A+B+C em estrela (`B→A`, `C→A`): A com todas as mensagens; B e C com zero; provenance de B e de C preservada; duas auditorias independentes.
3. `unmerge(B)`: mensagens de B voltam para B; mensagens de C permanecem em A; A e C coerentes.
4. `unmerge(C)` em seguida: mensagens de C voltam para C; A fica só com o conteúdo original.
5. Tentativa de cadeia: `C→B` e depois `B→A` deve falhar com `MERGE_CHAIN_NOT_ALLOWED`, sem nenhuma alteração parcial (verificar mensagens, `merged_into_thread_id`, status e ausência de auditoria nova).
6. Guardas anteriores (contexto não-sales, contatos diferentes, loser já mergeado) seguem rejeitando.

Todos os cenários rodam em bloco transacional que termina em exceção, garantindo reversão total. Nota de ambiente já conhecida: cada thread sintética do mesmo contato precisa de `primary_endpoint_id` distinto por causa do índice único legado de threads ativas, e os estados de teste devem ser definidos após inserir mensagens para o gatilho `messages_smart_reopen` não interferir.

## Dry-run real — números já apurados (leitura, sem escrita)

Grupos comerciais duplicados atuais (`business_context = 'sales'`, canal WhatsApp, threads não mergeadas), agrupados por organização + contato:

| Métrica | Valor |
|---|---|
| Grupos duplicados | 90 |
| Grupos com exatamente 2 threads | 90 |
| Grupos com 3+ threads | 0 |
| Threads envolvidas | 180 |
| Merges planejados (losers) | 90 |
| Maior grupo | 2 threads |
| Losers que já são winners de merge ativo (seriam bloqueados) | 1 |

Consequências: como o maior grupo tem 2 threads, o formato estrela é trivialmente satisfeito para 89 dos 90 grupos — winner = thread mais antiga, loser = a outra.

Único grupo bloqueado pelo novo guard:

- contato `Joao Teste` (`c90e9e78…`) — winner candidato `9c158663…` (2 mensagens, criado em 17/06) e loser candidato `5f77df99…` (46 mensagens, criado em 27/06), sendo que o loser já é winner de 1 merge ativo. Será listado para revisão manual e excluído do lote.

Após o guard entrar, o dry-run será recalculado e reapresentado com a mesma tabela mais a lista explícita de bloqueados, para conferência antes de qualquer execução.

## Fora de escopo nesta GMUD

- Reversão transitiva ou provenance em cadeia (opções 2 e 3 descartadas).
- Qualquer alteração em `unmerge_message_thread`.
- Execução de merge real, criação de índice único de thread comercial e ativação da flag `conv_route_resolver_v2` (segue OFF).

## Detalhes técnicos

- Objeto alterado: `public.merge_sales_threads` (recriada via migration com o guard adicional; assinatura inalterada).
- Fonte de verdade do encadeamento: `message_thread_merge_audit (winner_thread_id, unmerged_at)`.
- Ordenação do winner no dry-run: `created_at ASC`, desempate por `id`.
- Nenhuma alteração de schema, RLS, grants ou Edge Function.
