# Ocultar Conversa com Desfazer (5s)

Adicionar a possibilidade de **ocultar uma conversa** da lista de Mensagens, com um botão visível e um período de **5 segundos para desfazer**, caso o clique tenha sido por engano.

## Comportamento

- Cada item da lista de conversas (painel esquerdo em `/messages`) ganha um ícone "Ocultar" (olho riscado) que aparece no hover.
- Ao clicar:
  1. A conversa some imediatamente da lista (otimista).
  2. Um toast aparece: "Conversa ocultada — Desfazer" com contagem regressiva de 5 segundos.
  3. Se o usuário clicar em "Desfazer" antes dos 5s, a conversa volta para a lista no mesmo lugar.
  4. Se passarem 5s sem ação, a ocultação é confirmada localmente (persistida).
- A ocultação é **somente local ao usuário** (não afeta outros membros da organização) e **não exclui mensagens** — apenas remove da listagem.
- Quando uma nova mensagem inbound chegar em uma conversa ocultada, ela **reaparece automaticamente** na lista (regra: mensagem nova > ocultação anterior).

## Onde fica o botão

- No `ChatListItem` da lista esquerda em `src/pages/messages/MessagesList.tsx` (renderizado dentro do `ListBox`, linha ~1134), aparece à direita um pequeno ícone (olho riscado) ao passar o mouse.
- Também adicionado um item "Ocultar conversa" no menu de ações do header da conversa aberta (painel direito), para acesso via teclado/touch.

## Detalhes técnicos

- **Persistência**: lista de IDs de threads ocultadas guardada em `localStorage` por usuário (chave `hidden_threads_{userId}`), junto com o timestamp da ocultação. Persistência local é suficiente para "ocultar da minha visão" e evita migração de banco; pode evoluir depois para tabela `user_hidden_threads` se necessário.
- **Hook novo**: `src/hooks/useHiddenThreads.ts` — expõe `hiddenIds: Set<string>`, `hideThread(id, hiddenAt)`, `unhideThread(id)`, e `isHidden(id, lastInboundAt)` (retorna `false` se chegou nova mensagem após `hiddenAt`, fazendo a conversa reaparecer).
- **Filtragem**: em `MessagesList.tsx`, dentro do `filteredThreads` (linha ~1001), excluir threads cujo `isHidden(thread.id, thread.last_inbound_at)` seja `true`.
- **Undo timer**: ao chamar `hideThread`, agendar `setTimeout(commit, 5000)`. Estado intermediário "pendingHide" mantém o id em memória; se "Desfazer" for clicado, `clearTimeout` + remover do Set. O toast usa o `useToast` existente (`src/hooks/use-toast.ts`) com `action` customizado mostrando "Desfazer".
- **Acessibilidade**: botão tem `aria-label="Ocultar conversa"`, `e.stopPropagation()` para não selecionar o thread ao clicar.
- **i18n**: textos em `pt-BR` e `en-US` seguindo o padrão já usado no arquivo (`locale === 'pt-BR' ? '...' : '...'`).

## Arquivos a alterar/criar

- Criar `src/hooks/useHiddenThreads.ts`
- Editar `src/pages/messages/MessagesList.tsx`:
  - Importar e usar `useHiddenThreads`
  - Filtrar `filteredThreads` removendo ocultadas
  - Passar `onHide` ao `ChatListItem` e renderizar botão de ocultar com hover
  - Toast com ação "Desfazer"
- (Opcional) Adicionar item "Ocultar conversa" no menu do header da conversa aberta.

## Fora do escopo

- Sincronização entre dispositivos/usuários (ocultação fica local por enquanto).
- Tela de "Conversas ocultadas" para revisão — pode ser tema de uma próxima iteração se desejado.
