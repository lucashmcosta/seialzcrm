## Mudanças

### 1. Remover nome do contato nas mensagens recebidas (inbound)

Hoje as bolhas mostram `nome · hora` tanto nas mensagens enviadas pelos usuários do CRM (outbound) quanto nas recebidas do cliente (inbound). Vamos manter o nome **só no outbound** — no inbound mostramos apenas a hora.

Arquivos afetados (mesma lógica em todos):

- `src/pages/messages/MessagesList.tsx`
  - Footer do balão (linhas ~1630-1640): remover o ramo `selectedThread?.contact_name ? ... : ''` no caso `!isOutbound`.
  - Timestamp do player de áudio (linhas ~1573-1577): mesma remoção no `senderLabel` quando `!isOutbound`.
- `src/components/contacts/ContactMessages.tsx` (linha ~632): mesma alteração.
- `src/components/mobile/MobileMessagesList.tsx`: aplicar a mesma regra no footer/áudio (se houver render equivalente).

Comportamento final:
- Outbound (usuário ou agente IA): `Tamires Sousa · 14:04 ✓✓`
- Inbound (cliente): `14:03` apenas.

Badge "Agente IA" no topo das mensagens do agente continua igual.

### 2. Controle de velocidade no player de áudio (1x / 1.5x / 2x)

Em `src/components/whatsapp/AudioMessagePlayer.tsx`:

- Adicionar `playbackRate` no estado (default `1`).
- Ciclar entre `1 → 1.5 → 2 → 1` ao clicar.
- Aplicar via `audioRef.current.playbackRate = playbackRate` em um `useEffect` e ao iniciar o `play()`.
- Renderizar um botão pequeno à direita do waveform (substituindo nada, apenas adicionado), no estilo WhatsApp: pill compacto com texto `1x` / `1.5x` / `2x`, mesma cor `currentColor`, sem background quando `1x` e levemente destacado quando acelerado.
- Posicionar entre o waveform e a margem direita, mantendo a altura de 24px da Row 1.
- Esconder o botão enquanto `isLoading`.

Sem mudanças em backend, banco ou edge functions.

## Validação

- Abrir uma conversa com mensagens de áudio em ambos sentidos.
- Conferir: bolha do cliente sem nome, bolha do usuário com nome.
- Tocar um áudio, clicar no botão de velocidade e confirmar a aceleração audível e o label atualizado.
- Repetir no mobile (`MobileMessagesList`) e na aba de mensagens do contato (`ContactMessages`).
