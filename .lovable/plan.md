# Agrupamento inteligente de mensagens (estilo Kommo) — Comercial

Mudança exclusivamente visual na timeline do módulo Comercial (`/commercial`, `src/pages/messages/MessagesList.tsx`). Nada de SQL, RPC, Edge Function, flags, paginação, realtime ou modelo de mensagens.

## Como está hoje

A timeline monta `chatItems` (mensagens + notas internas) ordenados por data, e renderiza cada item isolado dentro de um container `space-y-3`. Cada bolha repete o rodapé com nome do remetente, horário e ícone de status. Não há avatar nas bolhas. Já existem quebras visuais: separador de data, divisor de "Número alterado" e mensagens de sistema (migração de endpoint) centralizadas.

## Regras de agrupamento

Uma nova função pura decide, para cada item, se ele **inicia** e/ou **encerra** um grupo:

- Mesma "identidade de remetente" consecutiva = mesmo grupo. A identidade é a combinação de: direção (inbound/outbound), tipo de remetente (`user` / `agent` / sistema) e o autor (`sender_name` / `sender_agent_id`).
- Troca de remetente sempre inicia novo grupo.
- Intervalo maior que o limite configurável (padrão **5 minutos**, constante exportada) entre a mensagem anterior e a atual inicia novo grupo.
- Quebram grupo sempre: separador de data, divisor de número alterado, mensagens de sistema (migração de endpoint), notas internas e qualquer item que muda de tipo.
- Falha de envio (`whatsapp_status = 'failed'`) encerra o grupo, para o motivo do erro não ficar colado no bloco seguinte.
- Mensagens de texto, mídia, áudio, documentos e templates participam do mesmo grupo quando a identidade do remetente é a mesma.

## Efeito visual

- **Primeira mensagem do grupo**: mostra os metadados de cabeçalho (nome do remetente / badge de Agente IA quando aplicável).
- **Mensagens intermediárias**: sem nome e sem horário; cantos arredondados reduzidos no lado do remetente para formar um bloco contínuo; espaçamento vertical menor (`mt-0.5`) contra o `space-y-3` entre grupos.
- **Última mensagem do grupo**: exibe horário e o ícone de status (enviando / enviado / entregue / lido / erro), exatamente como hoje.
- Grupo de uma única mensagem se comporta como hoje (cabeçalho + horário + status).
- Áudio: o player já renderiza horário/status internamente; o timestamp passa a ser exibido só na última mensagem do grupo, e o rótulo do remetente só na primeira.
- Hover para "Responder" continua por mensagem individual.

Como o agrupamento é derivado da lista já ordenada em memória, funciona igualmente para histórico e para mensagens que chegam por realtime/otimistas (a última bolha do bloco recalcula seu rodapé quando outra mensagem do mesmo autor entra).

## Detalhes técnicos

- Novo arquivo `src/lib/messageGrouping.ts`: `GROUP_GAP_MS` (5 min) + `computeMessageGroups(items)` retornando, por item, `{ isGroupStart, isGroupEnd }`. Função pura, sem dependência de React.
- Novo teste `tests/message-grouping.test.ts` cobrindo: mesmo autor dentro da janela agrupa; troca de direção quebra; gap > 5 min quebra; nota interna e mensagem de sistema quebram; falha encerra grupo; mídia/áudio agrupam com texto do mesmo autor.
- `MessagesList.tsx`: dentro do `chatItems.map` existente, consumir as flags para condicionar cabeçalho, rodapé (nome/hora/status), raio das bordas e margem. Nenhuma query, hook, ordenação ou tipo alterado. Os separadores de data/rotação continuam calculados como hoje e alimentam a quebra de grupo.
- Atendimento (`/inbox`) e mobile não são tocados nesta etapa.

## Verificação

- `tsgo` + suíte de testes existente.
- Screenshot da conversa Comercial (histórico com blocos agrupados) para confirmar redução de repetição de nome/horário.
