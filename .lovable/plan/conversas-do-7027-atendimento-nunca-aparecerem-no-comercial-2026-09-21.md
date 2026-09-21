# Conversas do 7027 (Atendimento) nunca aparecerem no Comercial

## O que está acontecendo (verificado)

A lista do Comercial já exclui corretamente as conversas do 7027 quando carrega a tela: a consulta principal só traz conversas do tipo Comercial. Nenhuma conversa do 7027 está marcada como Comercial no banco (5.636 + 1.057 estão todas como Atendimento).

O vazamento acontece no **tempo real**: quando chega mensagem nova, a tela do Comercial busca aquela conversa por identificador usando uma segunda consulta (`rpc_get_message_threads_by_ids`) que **não filtra por tipo de conversa** — ela só exclui contatos já marcados como "Cliente". Como a Flávia era um lead novo, a conversa dela no 7027 foi inserida ao vivo no topo da lista do Comercial, mesmo sendo de Atendimento. Ao recarregar a página, ela desaparecia — o que explica o relato confuso.

Dois pontos secundários confirmados no mesmo caminho:
- O aviso do sininho leva **sempre** para a tela Comercial, mesmo quando a conversa é de Atendimento (`src/components/Notifications.tsx`).
- Ao abrir o Comercial vindo de um contato (atalho "conversar"), a busca da conversa por contato não verifica o tipo, podendo abrir uma conversa de Atendimento dentro do Comercial (web e mobile).

## O que será feito

1. **Banco** — passar a mesma regra de tipo da lista para a consulta de tempo real: só devolve conversas Comerciais (e o caso legado sem tipo definido, exatamente como hoje na lista). Efeito: nenhuma conversa do 7027 volta a aparecer no Comercial, nem ao vivo.
2. **Sininho** — o aviso de mensagem nova passa a levar para a tela certa conforme o tipo da conversa: Atendimento vai para Atendimento, Comercial vai para Comercial.
3. **Atalho a partir do contato** — ao abrir o Comercial por um contato, considerar apenas conversas Comerciais; se o contato só tem conversa de Atendimento, o Comercial abre/cria a conversa comercial em vez de exibir a de Atendimento (web e mobile).

Nada muda no Atendimento: as meninas continuam vendo e resolvendo normalmente as conversas do 7027, e o fluxo acordado (resolver e pedir para o Comercial chamar pelo número comercial) continua igual.

## Fora de escopo

- Não altero a distribuição automática de responsável (a fila única continua como está).
- Não mexo em conversas existentes, nem migro nada entre módulos.
- Não altero permissões, RLS nem envio de mensagens.

## Detalhes técnicos

- Migração: `CREATE OR REPLACE FUNCTION public.rpc_get_message_threads_by_ids` acrescentando `LEFT JOIN communication_endpoints e ON e.id = mt.primary_endpoint_id` e a cláusula idêntica à de `rpc_list_message_threads`: `business_context = 'sales' OR (business_context IS NULL AND lifecycle_stage IS DISTINCT FROM 'customer' AND (NOT cs_flag OR e.id IS NULL OR e.purpose IS DISTINCT FROM 'customer_service'))`. Assinatura e colunas de retorno inalteradas; único consumidor é `useMessageThreads` (Comercial web/mobile).
- `src/components/Notifications.tsx`: em `handleNotificationClick`, para `entity_type` `message_thread`/`message`, ler `message_threads.business_context` do `entity_id` e navegar para `/inbox?thread=<id>` quando `customer_service`, senão `/commercial`.
- `src/pages/messages/MessagesList.tsx` (`loadThreadForSelection`) e `src/components/mobile/MobileMessagesList.tsx` (busca por `contact_id`): filtrar `business_context` comercial/legado antes de selecionar a thread.

## Validação

- Consulta direta à função nova provando que a thread `73fee2db…` (Flávia, 7027) não é retornada, e que uma thread comercial conhecida continua sendo.
- Contagem de conversas do 7027 elegíveis ao Comercial antes/depois (esperado: 0).
- Build/typecheck limpos.
