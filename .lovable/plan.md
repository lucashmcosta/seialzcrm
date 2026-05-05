## Mudança

Substituir a data repetida em cada bolha por um separador estilo WhatsApp (pílula centralizada com a data) que aparece quando o dia muda entre uma mensagem e outra.

## Implementação em `src/pages/messages/MessagesList.tsx`

### 1. Antes do `chatItems.map(...)` (linha ~1273)

Adicionar:

- Função `formatDateSeparator(dateStr)` que retorna:
  - `HOJE` / `TODAY` se for hoje
  - `ONTEM` / `YESTERDAY` se for ontem
  - Nome do dia da semana (ex: `QUARTA-FEIRA`) se < 7 dias
  - `05 DE MAIO DE 2026` (formato longo) caso contrário
- Variável `lastDateKey` (controle de mudança de dia usando `toDateString()`)
- No início do `.map()`, comparar a data do item atual com `lastDateKey` e, se diferente, renderizar uma pílula:

```tsx
<div className="flex justify-center my-3">
  <div className="px-3 py-1 rounded-full bg-muted/70 text-muted-foreground text-[11px] font-medium tracking-wide shadow-sm">
    {formatDateSeparator(itemDate)}
  </div>
</div>
```

Retornar um `<Fragment>` contendo `[separador?, item]`.

### 2. Rodapé das mensagens de texto/mídia (linhas ~1421-1441)

Remover a parte da data, mantendo apenas **Nome - HH:MM**:

```tsx
<span className="text-[11px] leading-[14px] text-muted-foreground/70 whitespace-nowrap">
  {isOutbound 
    ? (message.sender_name ? `${message.sender_name} · ` : '')
    : (selectedThread?.contact_name ? `${selectedThread.contact_name} · ` : '')
  }
  {new Date(message.sent_at).toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', hour12: false
  })}
</span>
```

### 3. Rodapé do `AudioMessagePlayer` (linhas ~1370-1382)

Remover `dateStr` do `audioTimestamp`. Passar apenas:

```ts
const audioTimestamp = `${senderLabel}${timeStr}`;
```

### 4. Rodapé das notas internas (linhas ~1286-1299)

Mesma simplificação: remover a data, manter `Autor · HH:MM`.

## Resultado

```
─────── HOJE ───────
[Olá! Tudo bem?]              Ketlyn Vieira · 09:51 ✓✓
[Tudo, e você?]   contato · 10:02

────── ONTEM ───────
[Mensagem de ontem]   contato · 18:30
```

A data fica visível só quando muda de dia, e cada bolha exibe apenas o nome e horário — exatamente como no WhatsApp.