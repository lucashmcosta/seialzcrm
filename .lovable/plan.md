

## Corrigir cor da logo no header mobile

**Problema**: O `SeialzLogo` no header mobile usa `theme="green"` que mapeia para `hsl(153, 100%, 12%)` — um verde escuríssimo, quase invisível no fundo escuro do header.

**Solução**: Trocar para `theme="dark"` que usa `hsl(150, 100%, 50%)` — o verde neon vibrante da marca.

### Mudança

**`src/components/mobile/MobileLayout.tsx`** (linha 91):
- De: `<SeialzLogo size="sm" theme="green" animated={true} />`
- Para: `<SeialzLogo size="sm" theme="dark" animated={true} />`

