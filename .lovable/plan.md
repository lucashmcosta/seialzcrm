

# Plano: Remover rounded-full no tema Seialz

## Problema
No tema Seialz, todos os botoes, inputs, selects, badges, tabs, modais e filtros estao com `rounded-full` (pill). O design system Seialz usa `border-radius: 6px` (angular), nao pill.

## Solucao
Adicionar overrides CSS no `.theme-seialz` no `index.css` para forcar `border-radius` correto em todos os componentes shadcn, sem mexer nos componentes individuais (preserva o estilo pill do tema default).

## Arquivo a modificar

**`src/index.css`** — Adicionar bloco de overrides apos o `.theme-seialz` existente:

```css
/* ═══ SEIALZ: Override rounded-full → 6px ═══ */
.theme-seialz button,
.theme-seialz [role="combobox"],
.theme-seialz input,
.theme-seialz textarea,
.theme-seialz select,
.theme-seialz [data-radix-collection-item],
.theme-seialz [role="dialog"],
.theme-seialz [role="alertdialog"],
.theme-seialz .rounded-full,
.theme-seialz .rounded-xl,
.theme-seialz .rounded-2xl {
  border-radius: 6px !important;
}

/* Preservar circular em avatars e status dots */
.theme-seialz [data-slot="avatar"],
.theme-seialz .rounded-full.h-1,
.theme-seialz .rounded-full.h-1\.5,
.theme-seialz .rounded-full.h-2,
.theme-seialz .rounded-full.h-2\.5,
.theme-seialz .rounded-full.w-1,
.theme-seialz .rounded-full.w-1\.5,
.theme-seialz .rounded-full.w-2,
.theme-seialz .rounded-full.w-2\.5,
.theme-seialz .overflow-hidden.rounded-full /* avatars */,
.theme-seialz [class*="shrink-0"][class*="overflow-hidden"][class*="rounded-full"] {
  border-radius: 9999px !important;
}

/* Switch e scrollbar thumb permanecem pill */
.theme-seialz [role="switch"],
.theme-seialz [role="switch"] span,
.theme-seialz [data-radix-scroll-area-thumb] {
  border-radius: 9999px !important;
}
```

Isso afeta: buttons, selects, inputs, badges, tabs, modais (`rounded-2xl`), dialogs, dropdowns — tudo vira 6px. Avatars, switches e dots de status preservam circular.

