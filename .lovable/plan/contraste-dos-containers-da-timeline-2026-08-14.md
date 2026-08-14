# Contraste dos containers da timeline

Os cartões de contexto da conversa (Comercial) estão praticamente invisíveis porque usam um fundo com opacidade muito baixa sobre o fundo da área de mensagens.

## O que muda

- Fundo do container fica visivelmente mais escuro/definido do que a área da conversa.
- Borda do container fica mais presente, delimitando claramente onde cada bloco começa e termina.
- Nada muda nos balões de mensagem, nos separadores de evento, no colapso "Ver mais" ou em qualquer regra de negócio.
- Continua funcionando em tema claro e escuro, usando tokens semânticos (sem cores fixas).

## Detalhe técnico

- Arquivo: `src/pages/messages/MessagesList.tsx`, linha 2738 (container do segmento `block`).
- De: `border border-border/30 bg-muted/10`
- Para: `border border-border/70 bg-muted/50`
- Alteração puramente de classes Tailwind, sem tocar em dados, hooks ou consultas.
