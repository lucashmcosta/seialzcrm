## Problema

No mobile (`/inbox` → conversa aberta), o `InboxComposer` ocupa muito espaço vertical porque empilha 4 blocos:

1. Linha de abas "Responder / Nota interna / Reatribuir para mim"
2. Aviso "Esta conversa está atribuída a outro usuário."
3. Textarea com `min-h-[44px]` + padding `pt-3 pb-1` + linha inferior com ações (anexo, mic, enviar)
4. Hint "Enter envia · Shift+Enter quebra linha"

A do `/messages` (mobile) é uma barra única: `+` à esquerda, input pill, mic e botão enviar à direita.

## Mudança

Adicionar prop `compact?: boolean` em `src/components/inbox/InboxComposer.tsx`. Quando `compact=true` (passado pelo `MobileInbox`), renderizar layout enxuto inspirado no `MobileMessagesList`:

- **Wrapper externo**: trocar `px-6 pt-3 pb-4` por `px-2 py-2` e remover `max-w-3xl mx-auto`.
- **Linha de abas (Responder/Nota interna)**: ocultar. Trocar por um único botão pequeno toggle (ícone `Note`) dentro da barra inferior para alternar para modo nota. "Reatribuir para mim" já existe no header do `MobileInbox` (menu de 3 pontos), então remover daqui no compact.
- **Aviso "atribuída a outro usuário"**: ocultar no compact (header já indica via menu).
- **Caixa unificada**: substituir por uma linha única estilo pill — `+` (MediaUploadButton só com ícone), `Textarea` rows=1 (`min-h-[36px] max-h-[120px]` com padding reduzido), `AudioRecorder`, botão enviar `h-9 w-9`. Tudo em um `flex items-center gap-1` com `rounded-full border` ao redor do textarea ou da linha inteira, igual ao padrão do `/messages`.
- **Hint "Enter envia…"**: ocultar no compact.
- **Modo nota**: quando ativo, manter tinta âmbar no input e no botão enviar; um pequeno botão de toggle (ícone `Note`) ao lado do `+` permite alternar e dá feedback visual (highlight âmbar).

Em `src/components/mobile/MobileInbox.tsx` (linha 475): passar `compact`:

```tsx
<InboxComposer compact thread={thread as any} ... />
```

Comportamento desktop fica intacto (sem `compact` continua como hoje).

## Fora de escopo

- Não alterar lógica de envio, templates, RAG, 24h window, takeover, etc.
- Não tocar no desktop `InboxComposer`.
- Não mexer no `MobileMessagesList`.

## Arquivos

- `src/components/inbox/InboxComposer.tsx` — adicionar prop `compact` e branch de render compacto.
- `src/components/mobile/MobileInbox.tsx` — passar `compact`.
