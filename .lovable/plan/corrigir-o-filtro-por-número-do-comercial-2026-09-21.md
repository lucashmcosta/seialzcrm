# Corrigir o filtro por número do Comercial

## Diagnóstico confirmado

O filtro por número é aplicado hoje no navegador **depois** que a tela recebe uma página geral de 50 conversas. A RPC `rpc_list_message_threads` não recebe o número/endpoint escolhido; por isso, ao selecionar 7020, a primeira página pode ficar vazia mesmo existindo conversas em páginas posteriores.

Na Central Trabalhista, a validação do banco confirmou o caso exato: há **1.286 conversas abertas do 7020**, mas a primeira aparece apenas na posição geral **374**; nenhuma está nas primeiras 50.

## Alterações

1. **Filtrar no banco antes de paginar**
   - Estender a assinatura usada de `rpc_list_message_threads` com uma lista opcional de endpoints.
   - Aplicar o mesmo critério visual já usado na tela: endpoint da última mensagem; quando ausente, `primary_endpoint_id` da conversa.
   - Manter organização, permissões, contexto Comercial, busca, status, ordenação e cursor atuais.

2. **Enviar o número selecionado para a consulta**
   - Fazer `useMessageThreads` receber os IDs agrupados do número escolhido — incluindo as duas fichas do 7020, histórica Meta e atual Evolution.
   - Ao trocar o filtro, reiniciar a paginação e buscar diretamente a primeira página daquele número.
   - “Carregar mais” continuará usando cursor, mas agora dentro do resultado filtrado.

3. **Remover a dependência do filtro tardio**
   - Ajustar `MessagesList` para não depender somente das conversas já carregadas para decidir quais mostrar.
   - Preservar o botão, o diálogo e as opções 7067/7020 exatamente como estão.

4. **Validar**
   - Confirmar que 7020 mostra resultados imediatamente, sem clicar antes em “Carregar mais”.
   - Confirmar paginação, busca e abas “Minhas”, “Não atribuídas”, “Todas abertas” e “Resolvidas”.
   - Confirmar que 7067 continua correto e que o 7027/Atendimento permanece fora do Comercial.

## Impacto técnico

- **Módulo afetado:** Comercial/Messages.
- **Banco:** sim, alteração compatível de RPC via migration; nenhuma tabela ou dado será alterado.
- **RLS e multi-tenancy:** preservados; a RPC continuará validando associação ativa à organização e as permissões existentes.
- **Edge Functions e integrações externas:** não afetadas.
- **Documentação consultada:** `docs/README.md`, `docs/STATUS.md`, `docs/modules/messages/README.md`, `docs/modules/messages/data-model.md`, `docs/product/channel-boundaries.md`, ADRs 0001 e 0009, `docs/operations/conflicts.md` e drift de 2026-07-04.
- **Descoberta adicional:** concluída; não é necessária nenhuma regra de negócio nova.
