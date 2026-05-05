## Problema

Mensagens de áudio mostram apenas o horário (ex: `12:23`) no rodapé, enquanto mensagens de texto mostram o padrão completo: `Nome - DD/MM - HH:MM` seguido do ícone de status (ex: `Ketlyn Vieira - 05/05 - 11:52 ✓✓`).

Isso acontece porque em `src/pages/messages/MessagesList.tsx` (linhas 1372-1374), passamos para o `AudioMessagePlayer` apenas `toLocaleTimeString` como `timestamp`, sem o nome do remetente nem a data.

## Solução

### 1. `src/pages/messages/MessagesList.tsx` (linha ~1372)

Construir a string de timestamp do áudio com o mesmo formato usado no rodapé das mensagens de texto (linhas 1421-1440):

```
{isOutbound 
  ? (message.sender_name ? `${message.sender_name} - ` : '')
  : (selectedThread?.contact_name ? `${selectedThread.contact_name} - ` : '')
}DD/MM - HH:MM
```

Passar essa string como `timestamp` para o `AudioMessagePlayer`. Aplicar o mesmo timestamp tanto para áudio inbound (recebido) quanto outbound (enviado) — hoje só passamos quando é "audio-only" (sem texto), manter esse comportamento.

### 2. `src/components/whatsapp/AudioMessagePlayer.tsx`

O rodapé já renderiza `timestamp` + `statusIcon`. Apenas garantir que o container do timestamp permita o texto mais longo (`whiteSpace: 'nowrap'` ou ajustar `maxWidth` do bubble para 260-280px se necessário, para não quebrar em duas linhas em mobile).

### 3. Replicar nos outros locais que usam `AudioMessagePlayer`

Verificar e aplicar o mesmo padrão de label completa em:
- `src/components/whatsapp/WhatsAppChat.tsx`
- `src/components/contacts/ContactMessages.tsx`
- `src/components/mobile/MobileMessagesList.tsx`

(Em mobile, manter formato compacto se o componente já omite o nome em texto também — vou confirmar caso a caso ao implementar.)

## Resultado esperado

Áudio enviado mostrará no rodapé do player: `Ketlyn Vieira - 05/05 - 11:52 ✓✓`
Áudio recebido mostrará: `edvaldo da silva santos - 05/05 - 12:23`

Idêntico ao padrão das bolhas de texto.