

## Ajustes na tela de Login Mobile

Dois problemas identificados:

### 1. Logo apagada
O tema `logo-green` usa `color: hsl(153, 100%, 12%)` — verde escuríssimo, quase invisível no fundo escuro. Precisa trocar para o tema `logo-white` ou `logo-dark` (que usa o verde neon `hsl(150, 100%, 50%)`). A melhor opção é usar `theme="dark"` que dá o verde neon vibrante, ou criar um novo tema específico para mobile.

**Mudança**: Em `MobileSignIn.tsx`, trocar `<SeialzLogo size="xl" theme="green" />` para `theme="dark"`.

### 2. Tagline
Trocar "Do clique ao contrato" por "SALES OPS NATIVO" (ou remover totalmente, deixando só o logo). Baseado na mensagem, vou usar "SALES OPS NATIVO".

**Mudança**: Em `MobileSignIn.tsx`, linha 110, trocar o texto da tagline.

