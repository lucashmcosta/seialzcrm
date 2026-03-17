

## Fix: Flash de layout desktop antes do mobile carregar

### Causa raiz

O hook `useIsMobile()` inicializa com `useState<boolean | undefined>(undefined)`. No primeiro render, `!!undefined === false`, então **todas as páginas renderizam a versão desktop por 1 frame** até o `useEffect` rodar e detectar que é mobile.

### Correção

**Arquivo: `src/hooks/use-mobile.tsx`**

Duas mudanças:

1. **Inicializar com valor síncrono** — usar `window.innerWidth` direto no `useState` (disponível no cliente, sem SSR neste projeto):
```typescript
const [isMobile, setIsMobile] = React.useState<boolean>(
  () => window.innerWidth < MOBILE_BREAKPOINT
);
```

2. **Remover a coerção `!!`** — já é boolean direto, retornar `isMobile` sem cast.

Isso elimina o frame onde `isMobile = false` no mobile, prevenindo o flash do layout desktop em `/messages`, `/dashboard` e qualquer outra página que use a bifurcação mobile/desktop.

### Arquivos afetados
- `src/hooks/use-mobile.tsx` — única mudança necessária

