# Agrupar imagens seguidas, igual ao WhatsApp

## Como vai ficar
- Quando chegam ou saem **4 ou mais imagens seguidas** da mesma pessoa, sem texto entre elas, elas aparecem num único balão com uma grade 2×2.
- Com mais de 4, a quarta foto mostra "+N" por cima (ex.: "+3").
- Horário e status (enviado/lido) aparecem uma vez, no canto do balão.
- Clicar em qualquer foto abre a visualização em tela cheia, com setas para passar entre as fotos do grupo e contador "2 de 7".
- Imagem com legenda quebra o grupo e continua aparecendo sozinha, com o texto.
- Com 1 a 3 imagens nada muda.
- "Vincular como documento" continua disponível para cada foto: na tela cheia aparece o botão para a foto aberta, e também a opção de selecionar várias do grupo para vincular como páginas de um mesmo documento.

## Onde
- Comercial (Mensagens)
- Atendimento (Inbox)
- Versão celular das conversas

## Regra do grupo
Imagens consecutivas, mesmo sentido (cliente ou equipe), mesmo remetente, sem legenda, mesmo dia e até 5 minutos entre uma e a próxima. Qualquer outra mensagem, nota ou marco no meio quebra o grupo.

## Detalhes técnicos
- Novo helper puro `src/lib/messageImageGroups.ts` (`groupConsecutiveImages(items)`), com teste Bun cobrindo: 4 imagens agrupam; 3 não; legenda quebra; sentido/remetente diferente quebra; intervalo > 5 min quebra; nota no meio quebra.
- Novo componente `src/components/messages/ImageAlbumBubble.tsx` (grade + "+N") e `ImageAlbumViewer.tsx` (Dialog com navegação por setas/teclado).
- Integrar em `src/pages/messages/MessagesList.tsx` (timeline e `computeMessageGroups` tratam o álbum como um item), `src/components/inbox/InboxConversationTimeline.tsx` e `src/components/mobile/MobileMessagesList.tsx`.
- Só apresentação: nenhuma mudança em banco, envio, Edge Functions ou permissões. Reações, responder e editar continuam por mensagem individual (pela tela cheia).
- Tokens semânticos e bordas de 6px conforme design system.
