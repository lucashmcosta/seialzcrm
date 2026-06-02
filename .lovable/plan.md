## Compactar composer da Inbox no desktop

Aplicar o mesmo layout compacto (pill) já usado no mobile à versão desktop do `InboxComposer`, mantendo todas as funcionalidades.

### Mudanças em `src/components/inbox/InboxComposer.tsx`

Substituir o bloco grande não-compacto (Textarea com `min-h-[44px] max-h-[180px]`, linha de ações separada embaixo, hint "Enter envia · Shift+Enter quebra linha") por uma versão alinhada ao `/messages`:

1. **Wrapper**: manter `px-6 pt-3 pb-3` e `max-w-3xl mx-auto`.
2. **Tabs Responder/Nota interna + botão Assumir/Reatribuir**: manter como hoje (são úteis no desktop).
3. **ReplyPreview**: mantém acima da caixa.
4. **Caixa unificada**: trocar o layout de duas linhas (textarea em cima, botões embaixo) por uma única linha estilo pill:
   - `flex items-end gap-1 rounded-full border px-1 py-1`
   - `MediaUploadButton` (`+`) à esquerda
   - `Textarea rows={1}` com `min-h-[36px] max-h-[120px]`, borda transparente, `scrollbar-hide`
   - `AudioRecorder` + `Button` de envio (`h-9 w-9 rounded-full`) à direita
   - Cores âmbar quando `mode === 'note'` (mesma lógica atual)
5. **Remover** a linha de hint "Enter envia · Shift+Enter quebra linha" (já é convenção conhecida e ocupa espaço).
6. **Dialog de templates**: mantém igual.

### Fora do escopo
- Nenhuma mudança de lógica (send, takeover, templates, 24h, notas).
- Nenhuma mudança no mobile (`compact` branch fica como está).
- Sem mudanças em outros arquivos.

### Arquivo afetado
- `src/components/inbox/InboxComposer.tsx` (apenas a renderização do branch não-compacto)
