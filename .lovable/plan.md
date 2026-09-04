# Mensagens (comercial) no mobile: usar a RPC que já existe

Resultado da verificação no banco: **a RPC já existe e já cobre praticamente tudo que você pediu**. Não é preciso criar função nova nem índice novo. O trabalho é trocar a consulta do mobile e documentar isso.

## O que já existe hoje

- Nome exato: `rpc_list_message_threads` — a mesma que a tela web de Mensagens usa (`src/hooks/useMessageThreads.ts`).
- Escopo comercial: filtra `business_context = 'sales'` e, para threads antigas sem esse valor, aplica a regra de fallback (contato não-cliente e endpoint não sendo de atendimento).
- Já devolve resolvido, sem round-trip: `contact_id`, `contact_name`, `contact_phone`, `assigned_user_id`, `assigned_user_name`, prévia da última mensagem, status e datas.
- **Não lida já vem calculada** no campo `is_unread`, com a leitura por usuário logado (`message_thread_reads`) feita dentro da própria função — dispensa a segunda chamada que você mencionou.
- **Busca no banco** (`p_search`), sobre o dataset completo: por nome, telefone e telefone normalizado (só dígitos) — resolve o problema de "não acha porque não está entre as 100 mais recentes".
- Ordenação: `COALESCE(last_message_at, created_at) DESC NULLS LAST, id DESC`.
- Paginação: **cursor** (`p_cursor_updated_at` + `p_cursor_id`) em vez de offset — mais estável que offset numa lista que muda em tempo real.
- Segurança: valida vínculo ativo com a organização (erro `ACCESS_DENIED`) e respeita as regras de "ver tudo" vs. "ver só o meu".
- Índice: já existe `idx_threads_org_bizctx_lastmsg (organization_id, business_context, last_message_at DESC NULLS LAST)`, além dos índices por org/canal. Nenhum índice novo é necessário agora.

## Diferenças em relação ao contrato que você descreveu

- Não há `p_only_mine`; o equivalente é `p_assigned_user_id` (filtra por responsável) e `p_unassigned_only`.
- Não há `p_offset`; a paginação é por cursor.
- O canal vai em `p_channels` (array), ex.: `['whatsapp']`.

## O que fazer

1. **Mobile — trocar a consulta**: substituir o `from('message_threads').select('*, contacts:..., users:...')` por uma chamada à RPC com `p_organization_id`, `p_channels: ['whatsapp']`, `p_limit` (50) e, quando houver texto no campo de busca, `p_search` (com debounce ~300 ms, disparando nova consulta ao banco em vez de filtrar em memória).
2. **Mobile — paginação**: "carregar mais" passa a enviar o cursor da última linha da lista (`last_message_at ?? created_at` e `id`).
3. **Mobile — não lida**: passar a usar `is_unread` do retorno e remover a busca separada de `message_thread_reads` para a listagem (o upsert ao abrir a conversa continua).
4. **Documentação**: registrar a RPC e o contrato em `docs/mobile/backend-reference.md` e citá-la em `docs/modules/messages/data-model.md`.

## Nota técnica

`rpc_list_message_threads` existe em **duas assinaturas** (8 e 9 parâmetros — a de 9 adiciona `p_search`), drift já registrado. Chamadas nomeadas incluindo `p_search` resolvem para a versão certa, então nada travará; mas vale planejar a remoção da assinatura antiga de 8 parâmetros num passo separado, depois que web e mobile estiverem os dois na versão com busca. Isso é uma migração e não faz parte deste trabalho.

Este plano não altera banco nem a tela web; só a camada de dados da tela de Mensagens do app e a documentação.
