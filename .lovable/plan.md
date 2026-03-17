

## Fundo da tela de Login Mobile — Grid + Cifrões

Remover o glow radial e substituir por:

1. **Grid de linhas verdes** — usando CSS `background-image` com `linear-gradient` cruzado (horizontal + vertical), cor verde neon com opacidade muito baixa (~4-6%), espaçamento ~40px.

2. **Cifrões de moedas flutuantes** — símbolos de diferentes moedas (R$, $, €, £, ¥, ₹, ₿) posicionados como elementos decorativos com opacidade baixa (~8-12%), tamanhos variados, espalhados pelo fundo. Implementados como `<span>` absolutos dentro do container, com animação sutil de float via framer-motion.

### Mudanças

**`src/index.css`** — Atualizar `.mobile-signin-bg`:
- Remover `radial-gradient` (glow)
- Adicionar grid de linhas com dois `linear-gradient` (vertical e horizontal)

**`src/components/mobile/auth/MobileSignIn.tsx`** — Adicionar camada de cifrões:
- Array de símbolos monetários com posições (top/left), tamanhos e opacidades pré-definidos
- Renderizar como spans absolutos com `pointer-events-none`
- Animação sutil de flutuação (translateY lento) via framer-motion para dar vida

