# Causa raiz: o Preview está servindo uma versão antiga do módulo da timeline

## Respostas objetivas da auditoria

1. **Quem renderiza cada mensagem da timeline Comercial**
   `src/pages/messages/MessagesList.tsx` — componente interno `DesktopMessagesList` (o export `MessagesList` é apenas um wrapper que redireciona para `MobileMessagesList` quando `isMobile`). A rota `/commercial` em `src/App.tsx` aponta para `MessagesList`. Não existe componente separado de bolha: as mensagens são renderizadas inline dentro do `chatItems.map`.

2. **Onde o agrupamento foi implementado**
   Lógica pura em `src/lib/messageGrouping.ts` (`computeContextBlocks`, `computeMessageGroups`) e o consumo/cabeçalho de bloco dentro do mesmo `chatItems.map` de `MessagesList.tsx` (pré-passe de descritores, `blockFlags`, `blockHeader` inserido no `Fragment` junto de `separator`/`rotationSeparator`).

3. **Está conectado à tela do Comercial?**
   Sim. É o mesmo arquivo/componente que a rota `/commercial` usa. Não houve implementação em componente órfão.

4. **`isBlockStart` chega `true` no render? Quantos blocos?**
   Não é possível afirmar no navegador atual, porque o módulo que o browser executa **não contém** o novo código. O stack trace do console aponta `MessagesList.tsx:4024`, e o módulo entregue pelo dev server (`GET /src/pages/messages/MessagesList.tsx`) contém `computeMessageGroups`/`isGroupStart` (implementação do turno anterior) e **zero ocorrências** de `computeContextBlocks`, `blockHeader` e `formatPhoneDisplay`. Ou seja: o navegador roda a versão anterior, sem blocos.

5. **Por que o cabeçalho não aparece**
   Porque o bundle servido é anterior à edição: o módulo transformado no dev server não foi invalidado após a última gravação do arquivo (arquivo em disco 02:01 UTC; transform servido ainda é o do turno anterior). Não é problema de condição lógica (`block.isBlockStart`), de dados, nem de componente errado.

6. **Mover implementação para outro componente?**
   Não é necessário — o componente já é o correto.

## Correção proposta (mínima, sem mudança visual nova)

1. Reiniciar o processo do dev server para invalidar o grafo de módulos do Vite e forçar o re-transform de `MessagesList.tsx` e `messageGrouping.ts`.
2. Confirmar por HTTP que o módulo servido passa a conter `computeContextBlocks`, `blockHeader` e `formatPhoneDisplay` (gate objetivo: contagem > 0 em cada termo).
3. Abrir `/commercial` autenticado e contar blocos no DOM: quantidade de cabeçalhos renderizados e presença de "Cliente"/nome do operador + linha `WhatsApp • +55…`, além de conferir que o divisor "Número alterado" é seguido por um novo cabeçalho.
4. Reportar contagem real de blocos e itens da conversa aberta — sem novo ajuste visual nesta etapa.

## Notas técnicas

- Nenhuma alteração de SQL, RPC, Edge Function, flag, hook de dados ou contrato de mensagens.
- Se após o restart o cabeçalho ainda não aparecer, o próximo passo de diagnóstico é instrumentar temporariamente a contagem de blocos (`blockFlags.filter(b => b.isBlockStart).length`) no próprio render e ler pelo console, removendo a instrumentação em seguida.
- Aviso de `ref` em `RouteBadge`/`EndpointStatusChip` presente no console é independente deste problema e não bloqueia o render.
