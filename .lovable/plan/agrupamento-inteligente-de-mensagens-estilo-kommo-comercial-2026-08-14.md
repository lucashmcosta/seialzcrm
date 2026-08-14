# Agrupamento inteligente de mensagens (estilo Kommo) — Comercial

Mudança exclusivamente visual na timeline do módulo Comercial (`/commercial`, `src/pages/messages/MessagesList.tsx`). Nada de SQL, RPC, Edge Function, feature flag, paginação, realtime/websocket, modelo de mensagens ou contrato de API.

## Objetivo

Mensagens consecutivas do mesmo remetente formam um bloco visual único, reduzindo repetição de nome, horário e status. Somente apresentação.

## Como está hoje

A timeline monta `chatItems` (mensagens + notas internas) ordenados por data e renderiza cada item isoladamente dentro de `space-y-3`, repetindo o rodapé (nome, horário, status) em toda bolha. Não há avatar nas bolhas. Elementos especiais que permanecem como estão: separador de data, divisor de "Número alterado", mensagens de sistema (migração de endpoint) e notas internas.

## Identidade do remetente

Baseada apenas em identificadores estáveis, nunca em texto:

- `direction` (inbound/outbound)
- `sender_type` (`user` / `agent` / `system`)
- `sender_agent_id` ou `sender_user_id`

Inbound considera apenas a direção (mesma thread = mesmo contato).

Observação técnica: a coluna `messages.sender_user_id` existe no banco, mas hoje **não** é lida pelo select da timeline Comercial. Ela será adicionada ao select existente como campo somente-leitura (nenhuma nova query, nenhum novo filtro) para que a identidade do operador não dependa de `sender_name`.

## Regras de agrupamento

Função pura que devolve, por item, se ele inicia e/ou encerra um grupo:

- mesma identidade consecutiva = mesmo grupo;
- mudança de remetente inicia novo grupo;
- mudança de direção inicia novo grupo;
- mudança de tipo de item inicia novo grupo;
- intervalo maior que 5 minutos (`GROUP_GAP_MS`) inicia novo grupo;
- separador de data quebra grupo;
- divisor de "Número alterado" quebra grupo;
- mensagens de sistema quebram grupo;
- notas internas quebram grupo;
- mensagem com `whatsapp_status = 'failed'` encerra o grupo;
- mensagem com `reply_to_message_id` inicia novo grupo;
- texto, imagem, documento, áudio, vídeo, template e demais mídias agrupam normalmente quando a identidade é a mesma.

## Comportamento visual

Primeira mensagem do grupo: nome do remetente e badge de Agente IA quando aplicável.

Mensagens intermediárias: sem nome, sem horário, sem status; raio das bordas reduzido no lado do remetente para formar bloco contínuo; espaçamento vertical `mt-0.5`.

Última mensagem do grupo: horário e status (enviando, enviado, entregue, lido, erro), exatamente como hoje.

Grupo com uma única mensagem: idêntico ao comportamento atual.

Áudios: player atual preservado; o rótulo do remetente aparece só na primeira mensagem e o horário/status só na última.

Imagens e mídias: agrupam normalmente, preservam o espaçamento interno; apenas o espaço entre mensagens é reduzido.

## Interações

Nenhuma funcionalidade é removida. Cada mensagem continua individual para hover, responder, copiar, encaminhar, menu contextual e seleção.

## Realtime

O agrupamento vale para histórico, mensagens otimistas e mensagens recebidas por realtime. O cálculo é memoizado sobre a lista ordenada e as flags de cada item dependem apenas da vizinhança (anterior/atual), então a chegada de uma mensagem reavalia só o final do bloco afetado — sem recomputar semântica da timeline inteira nem mexer na assinatura do canal.

## Implementação

Novo arquivo `src/lib/messageGrouping.ts`, exportando:

- `GROUP_GAP_MS` (5 minutos)
- `computeMessageGroups(items)` → por item `{ isGroupStart: boolean; isGroupEnd: boolean }`

Função pura, sem dependência de React, recebendo a lista já ordenada e um descritor por item (tipo, direção, identidade, timestamp, flags de sistema/falha/reply, quebra de data e quebra de endpoint).

`MessagesList.tsx`: dentro do `chatItems.map` existente, consumir as flags para condicionar cabeçalho, rodapé, raio de borda e margem. Nenhuma alteração de hook, ordenação, paginação ou tipos de dados além do campo somente-leitura citado.

Novo teste `tests/message-grouping.test.ts`: mesmo autor dentro da janela agrupa; troca de direção quebra; troca de operador quebra; gap > 5 min quebra; nota interna e mensagem de sistema quebram; `reply_to_message_id` inicia grupo; falha encerra grupo; mídia/áudio agrupam com texto do mesmo autor; separador de data e troca de número quebram.

Atendimento (`/inbox`) e mobile não são tocados nesta etapa.

## Verificação

- `tsgo` + suíte de testes existente.
- Screenshot da conversa Comercial confirmando blocos agrupados e rodapé apenas na última mensagem.
