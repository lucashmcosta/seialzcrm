## Bug

O `MultiSelectFilter` usa `Popover` (shadcn/Radix), que é renderizado em portal fora do `DialogContent` de Filtros. O `Dialog` do Radix ativa o `RemoveScroll`, que bloqueia eventos de wheel em tudo que está fora da árvore do Dialog — por isso a lista do popover só rola com arrasto da scrollbar, nunca com a roda do mouse.

O `onWheel` atual em `MultiSelectFilter.tsx` (linhas 60–76) só tenta repassar o wheel pro Dialog quando o popover já está no topo/fundo. Não resolve o caso geral, pois o navegador nunca chega a aplicar o scroll nativo no popover.

## Correção

Em `src/components/opportunities/MultiSelectFilter.tsx`, substituir o `onWheel` do `<div className="max-h-64 overflow-auto py-1">` por uma versão que aplica o scroll programaticamente (contornando o `RemoveScroll`):

```tsx
onWheel={(e) => {
  const el = e.currentTarget;
  const canScroll = el.scrollHeight > el.clientHeight;
  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  const goingDown = e.deltaY > 0;
  const goingUp = e.deltaY < 0;

  // Se o popover ainda pode rolar na direção do wheel, aplica programaticamente
  // (necessário porque o RemoveScroll do Dialog bloqueia o scroll nativo).
  if (canScroll && ((goingDown && !atBottom) || (goingUp && !atTop))) {
    el.scrollTop += e.deltaY;
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Caso contrário, repassa pro container de filtros do Dialog
  const target = document.querySelector<HTMLElement>('[data-filters-scroll]');
  if (target) {
    target.scrollTop += e.deltaY;
    e.preventDefault();
  }
}}
```

Mudança única, isolada ao `MultiSelectFilter`. Não toco em `Popover`, `Dialog` nem em `OpportunitiesKanban`.

## Fora de escopo

- Não troco o `Popover` por menu inline nem mexo no portal.
- Não altero outros filtros (datas/valores) — não usam popover.
