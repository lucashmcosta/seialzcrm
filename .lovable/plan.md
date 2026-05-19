## Problema

O `ImpersonationBanner` (faixa vermelha "Logado como…") está sendo renderizado como **filho direto** de um container `flex h-screen` (flex-row) em `src/components/Layout.tsx`. Como o banner foi desenhado para ser uma barra horizontal no topo, ao virar item de uma row flex ele aparece espremido como uma **faixa vertical** entre o sidebar e o conteúdo — exatamente o que aparece no screenshot.

Isso acontece em dois lugares do `Layout.tsx`:
- Linha 99-100 (layout Seialz)
- Linha 245-246 (layout default)

## Correção

Envolver cada layout num wrapper `flex-col h-screen` com o `ImpersonationBanner` no topo (largura total) e a row sidebar+main embaixo ocupando o espaço restante.

### Mudança 1 — layout Seialz (linhas 98-113)
```tsx
return (
  <div className="flex flex-col h-screen bg-background overflow-hidden">
    <ImpersonationBanner />
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <SeialzSidebar ... />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  </div>
);
```

### Mudança 2 — layout default (linhas 244-256)
Mesma ideia: wrapper `flex-col`, banner no topo, depois a estrutura atual (`flex w-full` com sidebar fixa + main `pl-64`) dentro de um `flex-1 min-h-0 relative`.

Nenhuma alteração no `ImpersonationBanner.tsx` é necessária — ele já está bem desenhado como barra horizontal full-width.

## Arquivos afetados
- `src/components/Layout.tsx` (apenas estrutura JSX dos dois retornos)
