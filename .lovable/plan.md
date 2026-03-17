

## Ajustes na tela de Login Mobile

### 1. Inputs com fundo preto
Mudar `.mobile-input` em `src/index.css`: `background: hsl(0 0% 0%)` (preto puro) e `border: 1px solid hsl(0 0% 15%)` (borda cinza sutil).

### 2. Remover tagline "SALES OPS NATIVO"
Em `MobileSignIn.tsx`, remover o bloco `<motion.p>` da tagline (linhas 140-148).

### 3. Cifrões mais espalhados, menores, mais suaves
Expandir o array `currencySymbols` de 10 para ~18 símbolos com:
- Tamanhos menores (predominantemente `text-xs`, `text-sm`, `text-base`, poucos `text-lg`)
- Opacidades mais baixas (0.03-0.07)
- Posições mais distribuídas cobrindo toda a tela
- Incluir símbolos descendo: animação `y: [0, 8, 0]` para metade e `y: [0, -8, 0]` para outra metade (alguns sobem, outros descem)
- Duração mais longa (7-10s) para movimento mais suave
- Delays mais variados (0-5s)

