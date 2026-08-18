# Contraste dos TimelineBlocks + nome do operador nas mensagens

Somente apresentação. Nenhuma mudança em agrupamento, `computeContextBlocks`, envio, realtime, banco ou Edge Functions.

## Auditoria do nome do remetente

- `sender_name` (e `sender_user_id`, `sender_type`) **continuam sendo carregados** do banco: `src/pages/messages/MessagesList.tsx`, select da linha 1151, e os inserts otimistas já preenchem `sender_name` com o `full_name` do perfil (linhas 1342, 1489, 1595).
- O nome **não é renderizado em nenhum lugar** da timeline hoje: não há uso de `sender_name` no JSX do balão. Há apenas um comentário na linha 2523 indicando que a identidade "fica no cabeçalho do bloco" — ou seja, a informação foi removida apenas da UI durante os refinamentos.
- Conclusão: é uma restauração puramente visual, os dados já estão disponíveis.

## 1. Contraste do container

Arquivo: `src/pages/messages/MessagesList.tsx`

- Container (linha 2786): `bg-muted/55` → `bg-muted/85`; `border-border/65` → `border-border/80`.
- Régua do cabeçalho (linha 2391): `bg-border/50` → `bg-border/70`.
- Mantidos sem alteração: `shadow-sm`, `rounded-lg`, `px-3 py-2.5 mt-2.5`. Nenhum aumento de sombra.

## 2. Nome do operador em outbound humano

No rodapé do balão (bloco `isGroupEnd`, linhas ~2653-2664), antes do horário:

- Exibir `message.sender_name` somente quando: `isOutbound` **e** `message.sender_type === 'user'` **e** `message.sender_user_id` presente **e** `sender_name` não vazio.
- Formato: `Junior Domingos · 12:23` — nome no mesmo `text-[11px] leading-[14px]`, em `text-muted-foreground/70`, com `truncate` para nomes longos.
- Sem fallback: se faltar nome ou usuário, nada é exibido.
- `sender_type` `agent`/`system` (bot/automação) nunca recebe nome humano.
- Para mensagens de áudio (que usam o timestamp interno do player) o comportamento fica como está — nenhuma alteração no `AudioMessagePlayer`.

## Validação

- `tsgo` limpo.
- Conferência visual em `/commercial`: container claramente mais escuro que o fundo da conversa; outbound humano com nome; troca de operador não cria novo container (a segmentação continua dependendo apenas de `endpointBreak`).
