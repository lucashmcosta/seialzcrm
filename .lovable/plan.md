

## Correção: Mensagens cortadas no chat

### Problema
As bolhas de mensagem com URLs longas (sem espaços) não estão quebrando corretamente. O `break-words` do CSS não é suficiente para URLs muito longas. O `overflow-hidden` no container pai está simplesmente cortando o conteúdo em vez de permitir a quebra.

### Correção

**Arquivo:** `src/pages/messages/MessagesList.tsx`

1. **Linha 1396** — Adicionar `overflow-hidden` na bolha de mensagem para conter o conteúdo:
```tsx
'relative max-w-[70%] rounded-lg p-3 min-w-[80px] overflow-hidden',
```

2. **Linha 1469** — Trocar `break-words` por `break-all` no parágrafo de conteúdo, que força a quebra de URLs longas:
```tsx
<p className="text-sm whitespace-pre-wrap break-all">
```

3. **Linha 1347** — Mesmo fix para as notas inline (que também usam `max-w-[70%]`):
```tsx
<div className="max-w-[70%] rounded-lg p-3 min-w-[80px] overflow-hidden bg-yellow-100 ...">
```

Isso garante que qualquer texto longo (URLs, hashes do Facebook, etc.) quebre dentro da bolha em vez de expandir para fora da tela.

