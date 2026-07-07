## Diagnóstico

O erro `duplicate key value violates unique constraint "message_threads_unique_open_per_contact_endpoint"` acontece porque **já existe outra thread aberta** para o mesmo contato + endpoint. A constraint garante que só pode haver uma thread `open` por par (contact_id, primary_endpoint_id).

Estado atual do contato `FRANK MALAQUIAS DA CUNHA` (`92c0c98a-c09d-4f81-97ab-6cc86d56783f`), endpoint `c09bd713…` (+551150287027):

| Thread ID | Status | Criada em | Última msg | Mensagens |
|-----------|--------|-----------|------------|-----------|
| `1c0481c2…` (a que você tenta reabrir) | resolved | 30/05 12:21 | 03/07 20:10 | (histórico) |
| `716f9b17…` (thread fantasma) | **open** | 03/07 20:09 | — | **0** |

A `716f9b17` foi criada 30 s antes da última mensagem entrar na `1c0481c2`, nunca recebeu nenhuma mensagem e ficou aberta bloqueando qualquer reabertura.

## Correção pontual (dados)

Deletar a thread fantasma vazia `716f9b17-b34a-4364-b925-3952eeffff7d` para liberar o slot e permitir o "Reabrir" na `1c0481c2…`.

- Como não tem nenhuma mensagem (`messages` = 0), deletar é seguro — não há histórico a preservar.
- Depois a UI consegue reabrir normalmente.

## Correção estrutural (fluxo Reabrir)

O botão "Reabrir" hoje faz `UPDATE ... SET status='open'` direto e bate na constraint quando existe uma thread órfã aberta. Vou mudar o handler de reabrir para:

1. Antes do UPDATE, buscar se há outra thread `open` para o mesmo `(contact_id, primary_endpoint_id, business_context)`.
2. Se existir e estiver vazia (`messages` = 0) → deletar automaticamente (era thread fantasma criada por race) e prosseguir com o reopen.
3. Se existir e tiver mensagens → mostrar toast claro: "Já existe uma conversa aberta com este contato neste número — clique aqui para abrir" (link direto para a outra thread) em vez do erro cru do Postgres.
4. Só então executar o `UPDATE status='open'`.

Isso elimina o erro técnico exposto ao usuário e resolve threads fantasmas automaticamente.

## Arquivos afetados

- **Handler de reabrir thread** (a identificar entre `src/hooks/inbox/useInboxThread.ts` e componentes do painel direito da InboxPage — vou localizar exatamente na fase de build).
- **Dados**: `DELETE FROM message_threads WHERE id='716f9b17-b34a-4364-b925-3952eeffff7d'`.

## Fora do escopo

- Investigar por que a thread fantasma foi criada em 03/07 (potencial race entre webhook Meta e UI abrindo "Nova conversa"). Isso pode virar um item separado se você quiser — hoje só sei que uma thread ficou aberta sem nunca ter mensagens.
- Backfill retroativo procurando outras threads fantasmas do mesmo tipo. Posso rodar uma query de contagem antes/depois se você quiser saber o tamanho do problema.

## Critério de aceite

- Botão "Reabrir" na thread `1c0481c2…` funciona sem erro.
- Se no futuro existir uma thread aberta com mensagens para o mesmo par contato+endpoint, aparece toast amigável em vez de "duplicate key value…".
- Nenhuma mensagem histórica é perdida.