

## Trocar logo imagem → logo CSS/texto conforme manual da marca

### O que muda

Substituir a `<img>` do logo por um componente React `<SeialzLogo>` que renderiza o logo em texto puro usando Michroma, com colchetes em 22% opacidade, cursor `|` com `scaleX(0.35)` e animação `blink step-end`.

### Arquivos

**1. Criar `src/components/SeialzLogo.tsx`**
- Componente com props `size` (`xl`/`lg`/`md`/`sm`) e `theme` (`dark`/`light`) e `animated` (default true)
- Renderiza: `<span class="br">[</span>seialz<span class="cur">|</span><span class="br"> ]</span>`
- Classes CSS para tamanhos: xl=64px, lg=36px, md=20px, sm=14px

**2. Atualizar `src/index.css`**
- Adicionar classes `.seialz-logo`, `.seialz-logo .br` (opacity 0.22, letter-spacing 8px), `.seialz-logo .cur` (scaleX 0.35, blink step-end)
- Tamanhos `.logo-xl`, `.logo-lg`, `.logo-md`, `.logo-sm`
- Remover `.auth-logo-pulse` (não mais necessário)
- Manter `.auth-cursor-blink` para tagline

**3. Atualizar `src/components/auth/AuthLayout.tsx`**
- Remover import da imagem
- Importar `SeialzLogo`
- Banner: trocar `<motion.img>` por `<motion.div>` com `<SeialzLogo size="xl" theme="dark" />`
- Mobile: trocar `<img>` por `<SeialzLogo size="lg" theme="dark" />`

