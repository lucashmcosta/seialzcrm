# Contraste dos TimelineBlocks em /commercial

Somente apresentação. Nenhuma mudança de layout, agrupamento, segmentação, dados ou `TimelineEventMarker`.

## Alterações

Arquivo único: `src/pages/messages/MessagesList.tsx`

1. Container (className passado ao `TimelineBlock`, linha ~2786)
   - `bg-muted/30` → `bg-muted/55`
   - `border-border/40` → `border-border/65`
   - `shadow-sm`, `rounded-lg`, `px-3 py-2.5 mt-2.5` permanecem exatamente como estão.

2. Cabeçalho do container (`blockHeader`, linhas ~2378-2392)
   - "WhatsApp • Evolution" já está em `font-medium text-foreground` — mantido.
   - Número permanece `font-data text-muted-foreground` — mantido.
   - Separador inferior: `h-px bg-border/30` → `h-px bg-border/50` (mesma margem `mt-1.5 mb-2`).

## Verificação

- `tsgo` limpo.
- Conferência visual em `/commercial`: container perceptível contra o fundo da conversa, sem virar card destacado.
