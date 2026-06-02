## Diagnóstico
No `AudioMessagePlayer.tsx`, o botão de velocidade `1x` é estilizado como uma **pílula com borda** (`border: '1px solid currentColor'`, `borderRadius: 9999`). Dentro do balão branco do áudio, essa borda cria a sensação visual de um "badge solto" — como se estivesse fora do balão, parecendo layout quebrado. Na verdade está dentro do bubble, mas o estilo de pílula com contorno destoa do resto.

## Mudanças (apenas visuais)
Em `src/components/whatsapp/AudioMessagePlayer.tsx`:

1. **Remover a borda do botão `1x`**: trocar a aparência de pílula com contorno por um botão de texto leve, sem `border`, com background sutil em hover/ativo:
   - `border: 'none'`
   - `borderRadius: 4` (cantos suaves, alinhado ao padrão Seialz de 6px)
   - `background: 'transparent'` por padrão; quando `playbackRate !== 1`, `background: 'currentColor'` com opacidade baixa (`background: 'color-mix(in srgb, currentColor 15%, transparent)'`) para sinalizar ativo.
   - `padding: '2px 5px'`, `fontSize: 11`, `fontWeight: 600`, `opacity: 0.75` em 1x e `1` em rates ativos.
   - `minWidth: 28`.

2. **Reduzir o tamanho/peso visual** para ficar integrado ao bubble:
   - Usar a mesma cor/`currentColor` (já é), sem outline.
   - Adicionar `cursor: pointer` (já tem).

3. **Não mudar lógica**: ciclagem de rate, posicionamento na row 1, acessibilidade (`aria-label`) — mantidos.

4. **Não mexer** no waveform, play button, timestamps, ou no bubble pai (`InboxConversationTimeline.tsx`).

## Arquivo afetado
- `src/components/whatsapp/AudioMessagePlayer.tsx` (apenas o bloco do botão `cycleRate`).
