# Blocos de contexto na timeline Comercial (estilo Kommo)

Mudança exclusivamente visual em `/commercial` (`src/pages/messages/MessagesList.tsx`). Nada de SQL, RPC, Edge Function, flag, paginação, realtime ou modelo de mensagens.

## Objetivo

A timeline passa a ser dividida em **blocos de contexto**. Cada bloco tem um cabeçalho identificando quem está falando e por qual número/canal, e abaixo dele ficam todas as mensagens daquele contexto — sem repetir nome e metadados em cada bolha.

## Cabeçalho do bloco

Linha 1 (título):
- Operador humano: nome do operador (`sender_name`).
- Cliente (inbound): "Cliente" — ou o nome do contato quando conhecido.
- IA/Bot: "Assistente IA" (ou `sender_name` do agente) com ícone/badge existente.
- Nota interna: "Nota interna".
- Evento de sistema: mantém o formato atual de pílula central, sem cabeçalho.

Linha 2 (metadados, só quando houver endpoint conhecido):
- `WhatsApp • +55 11 5026-2890` (número formatado do `endpoint_id` da mensagem).
- Provider aparece apenas quando diferente do canal padrão, como sufixo discreto (ex. `WhatsApp • +55 11 93619-8439 • Evolution`), usando `provider` já disponível.

Estilo: texto pequeno, `text-muted-foreground`, alinhado ao lado do bloco (direita para outbound, esquerda para inbound), com espaçamento maior entre blocos que entre bolhas do mesmo bloco. Sem cores novas — apenas tokens semânticos.

## Regras de quebra de bloco

Novo bloco quando muda qualquer um dos identificadores de contexto:
- direção (cliente ↔ operador);
- operador (`sender_user_id`);
- entra ou sai IA/Bot (`sender_type = 'agent'`, `sender_agent_id`);
- número de envio / reply endpoint (`endpoint_id`);
- provider (Meta, Evolution, Twilio);
- evento de sistema (número alterado, migração, transferência) — o evento fecha o bloco e o próximo envio abre bloco novo já com o novo número;
- nota interna — sempre bloco próprio;
- separador de data.

O gap de 5 minutos **deixa de quebrar bloco**: passa a valer apenas como agrupamento interno de bolhas (raio de borda e espaçamento), preservando o comportamento atual dentro do bloco. Mensagens com falha e respostas (`reply_to_message_id`) também continuam apenas como quebra interna de bolha, sem abrir novo cabeçalho.

## Dentro do bloco

- Sem repetição de nome/badge por bolha: o nome sai do rodapé das bolhas e vive só no cabeçalho.
- Horário e status (enviando/enviado/entregue/lido/erro) continuam na **última** mensagem do bloco de bolhas, como hoje.
- Áudio, imagem, documento, vídeo e templates agrupam normalmente; players e espaçamentos internos preservados.
- Todas as interações por mensagem permanecem: hover, responder, copiar, encaminhar, menu contextual, feedback do agente.

## Implementação

`src/lib/messageGrouping.ts` ganha uma camada de contexto acima do agrupamento atual:
- `ContextItem` estende o descritor atual com `endpointId`, `provider` e `senderName`.
- `computeContextBlocks(items)` → por item `{ isBlockStart, isBlockEnd, blockIndex }`, função pura, decidida pela vizinhança imediata.
- `computeMessageGroups` permanece como está (agrupamento interno de bolhas), agora restrito ao interior de cada bloco.

`MessagesList.tsx`: no pré-passe já existente, montar os descritores de contexto (o `endpoint_id` da mensagem e `endpointNumbers[...]` já estão carregados — nenhuma query nova) e, no `chatItems.map`, renderizar o cabeçalho quando `isBlockStart` e aplicar o espaçamento entre blocos. Nenhuma alteração de hook, ordenação, paginação ou tipos além do que já existe.

`tests/message-grouping.test.ts`: novos casos para blocos — troca de operador, troca de direção, entrada de IA, troca de `endpoint_id`, troca de provider, evento de sistema fechando bloco, nota interna isolada, separador de data, e confirmação de que gap > 5 min **não** abre novo bloco.

Atendimento (`/inbox`) e mobile não são tocados.

## Verificação

- `tsgo` + suíte de testes.
- Validação visual por você no preview autenticado: cabeçalhos aparecendo nas trocas de operador/número e nenhuma repetição de nome dentro do bloco.
