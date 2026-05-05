# Corrigir página inicial de produção (seialz.com)

## Problema
Em produção (`seialz.com`), a rota raiz `/` está renderizando o componente placeholder `src/pages/Index.tsx` ("Welcome to Your Blank App") em vez do conteúdo real do Seialz.

Isto acontece porque em `src/App.tsx` (linha 177) a rota `/` aponta para `<Index />`, e não para a `LandingPage` (que já existe em `src/pages/LandingPage.tsx` mas só era usada anteriormente).

## Solução proposta

Alterar `src/App.tsx`:

1. **Remover** a importação do placeholder `Index` (linha 46).
2. **Trocar** a rota `/` para renderizar `<LandingPage />` (já está lazy-loaded na linha 49).

```tsx
// Antes
<Route path="/" element={<Index />} />

// Depois
<Route path="/" element={<LandingPage />} />
```

3. **Opcional**: deletar `src/pages/Index.tsx` para evitar uso futuro acidental.

## Após aprovação
Como a mudança envolve a página pública, o usuário precisará clicar em **Publish → Update** em Lovable para que `seialz.com` reflita a alteração (mudanças de frontend não são deployadas automaticamente).

## Confirmação necessária
A rota `/` deve mostrar a **LandingPage** pública (com hero, features, etc.), correto? Ou prefere que `/` redirecione direto para `/auth/signin` / `/dashboard` se logado?
