# Central — refazer o acerto do Atendimento e travar o "ligar com lista vazia"

## 1. O que o acerto das 15:30 fez (já conferido, só leitura)
O acerto rodou às 18:30:15 UTC com a lista vazia. Ele alterou 6 conversas, e todas ficaram "Sem responsável" (nenhuma foi devolvida e nenhuma passou pelo rodízio):

| Conversa | Responsável antes | Hoje |
|---|---|---|
| 30803202… | Bruna Araujo | aberta, sem responsável |
| 62aff697… | Bruna Araujo | aberta, sem responsável |
| c54fa9e9… | Luyza Calegari | aberta, sem responsável |
| f71089fc… | Luyza Calegari | **já resolvida**, sem responsável |
| 55d791ba… | Tamires Sousa (Consultor, sem acesso) | aberta, sem responsável |
| 910f6512… | Eduarda Ubeid (fora da lista) | aberta, sem responsável |

Hoje a lista tem Luyza, Mariane e Bruna, todas ativas, e o rodízio está ligado.

## 2. Refazer o acerto só para essas conversas
- O acerto vale para as 5 conversas que estão **abertas**. Para cada uma, a ordem é: o último responsável que esteja ativo na lista; senão o rodízio do Atendimento; senão fica sem responsável.
- Resultado esperado:
  - 30803202 e 62aff697 voltam para a Bruna;
  - c54fa9e9 volta para a Luyza;
  - 55d791ba e 910f6512 vão para o rodízio, ou para alguém da lista que já tenha atendido essas conversas antes.
- A conversa f71089fc já está resolvida, por isso fica de fora. Se ela reabrir, a regra de reabertura devolve para a Luyza.
- Motivo registrado no histórico: "Devolvida para quem atendia" ou "Rodízio do Atendimento". Ninguém é notificado e nada é enviado ao cliente.
- Antes de rodar, salvo um arquivo para desfazer (volta as conversas para sem responsável). Depois, registro no log quantas conversas foram para cada pessoa.

## 3. Proteção na tela (e no servidor)
- Interruptor geral desabilitado quando ninguém estiver ativo na lista, com a dica "Ative pelo menos uma pessoa na lista antes de ligar".
- Com o rodízio ligado, se ninguém ficar ativo na lista, aparece um aviso fixo: "Ninguém ativo na lista: conversas novas de Atendimento ficarão sem responsável."
- Também no servidor (além do pedido): ligar o rodízio com a lista vazia passa a ser recusado, com a mesma mensagem. Assim, ninguém consegue ligar por outro caminho.

## 4. Conferência dos números
Depois do item 2, confiro na tela e no banco, para cada atendente:
- **Abertas agora:** conversas abertas de Atendimento atribuídas a ela.
- **Recebidas hoje e 7 dias:** registros do histórico gravados pelo rodízio do Atendimento.
- **Último:** quando ela recebeu a última conversa.

Ponto já identificado: "Recebidas hoje" e "Último" contam só o que veio do rodízio do Atendimento ou do acerto. As conversas que as atendentes já tinham antes de ligar entram em "Abertas agora", mas não em "Recebidas". Isso segue a regra do documento ("a partir do histórico de atribuição do Atendimento"). Digo no log se algum número não bater.

## Detalhes técnicos
- Item 2: uma única operação com os 5 ids fixos, executada como função interna (SECURITY DEFINER, sem passar pelo bloqueio de permissões da tela), com `last_routing_decision.source = 'cs_round_robin'`. O histórico é gravado pelo `trg_log_thread_assignment_change`.
- Item 3, servidor: `cs_round_robin_enable` retorna o erro `cs_rr_empty_list` quando não há membro ativo com `can_receive_cs`; o código ganha um texto em português em `src/lib/permissions/errors.ts`. O rollback da função vai para `rollback/cs-rr-5-trava-lista-vazia.sql`.
- Item 3, tela: em `CsRoundRobinTab.tsx`, contar `people.filter(p => p.has_access && p.member_active)`; usar `PermissionGate` ou Tooltip no Switch quando estiver desligado; mostrar um Alert quando estiver ligado e a contagem for 0.
