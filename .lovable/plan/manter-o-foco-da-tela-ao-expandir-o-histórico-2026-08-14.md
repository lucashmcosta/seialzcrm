# Manter o foco da tela ao expandir o histórico

Ao clicar em "Ver N mensagens anteriores", o conteúdo antigo é inserido acima das mensagens visíveis, o que empurra a conversa para baixo e faz a tela "pular" para o início do bloco. A correção é puramente visual: preservar a posição de leitura atual.

## Comportamento desejado

- Clicar em "Ver N mensagens anteriores" expande o histórico **sem mover** o que está na tela.
- O usuário rola para cima manualmente para ver o histórico expandido.
- Clicar em "Ver menos" também mantém a posição atual (o conteúdo removido está acima).

## Como será feito

Somente em `src/components/messages/timeline/TimelineBlock.tsx`:

1. No clique do toggle, antes de mudar o estado, ler do viewport do `ScrollArea` (`[data-radix-scroll-area-viewport]`, já localizado hoje via `containerRef.current.closest`) os valores `scrollTop` e `scrollHeight` e guardá-los em um `ref`.
2. Em um `useLayoutEffect` disparado pela mudança de `expanded`, calcular `delta = novoScrollHeight - scrollHeightAnterior` e aplicar `viewport.scrollTop = scrollTopAnterior + delta`, limpando o `ref` em seguida.
3. Como as alturas são medidas item a item (`measureItem` → `setHeights`), aplicar a mesma correção de âncora enquanto o `ref` de ancoragem estiver ativo, para que remedições logo após a expansão (imagens/áudios) não desloquem a leitura. Após a estabilização o `ref` é limpo e o scroll volta a ser livre.

## Não muda

Regra de colapso por altura real, orçamento visual, container atual sempre aberto, agrupamento, cabeçalhos, paginação, realtime, envio, backend.

## Verificação

- `tsgo` limpo.
- Validação visual em `/commercial`: clicar em "Ver N mensagens anteriores" e confirmar que a mensagem que estava sob o cursor permanece na mesma posição da tela.
