

## Problema

A página de mensagens usa `h-screen` para o container do `ResizablePanelGroup`, mas está dentro do `Layout` que adiciona `pl-64` (sidebar fixa). O `h-screen` ocupa 100vw de largura implicitamente, mas como o conteúdo está deslocado 256px pela sidebar, o painel direito do chat extrapola a tela — cortando as mensagens.

## Correção

**Arquivo:** `src/pages/messages/MessagesList.tsx` (linha 1121)

Trocar:
```tsx
<div className="h-screen overflow-hidden">
```
Por:
```tsx
<div className="h-screen w-full overflow-hidden">
```

Na verdade, o problema real é que o Layout usa `min-h-screen` e o conteúdo com `h-screen` herda a altura do viewport inteiro, não do container. A correção correta é mudar para `h-full` em vez de `h-screen`, pois o parent (`<main>`) no Layout já tem `min-h-screen`. Porém o `main` precisa de `h-screen` para que `h-full` funcione.

A solução mais limpa: mudar o wrapper de `h-screen` para `h-[calc(100vh)]` e garantir que o overflow seja contido, junto com a largura. Mas o verdadeiro problema é apenas largura — o `overflow-hidden` já está lá, porém o conteúdo no painel direito não está limitado.

Olhando novamente: o `<div className="pl-64 flex-1 min-w-0 overflow-x-hidden">` no Layout já tem `min-w-0` e `overflow-x-hidden`. O `h-screen` dentro dele deveria respeitar a largura do parent. O `min-w-0` deveria evitar que o flex child transborde.

O real problema pode ser que o `ResizablePanelGroup` com seus painéis não está respeitando o container. O painel direito com `defaultSize={75}` calcula 75% do grupo, que está correto, mas o conteúdo dentro (mensagens longas sem `break-words`) pode estar forçando o painel a expandir.

A correção é adicionar `overflow-hidden` ao container do painel direito e garantir `break-words` nas mensagens.

**Arquivo:** `src/pages/messages/MessagesList.tsx`

1. Linha 1218 — adicionar `overflow-hidden` ao container do painel direito:
```tsx
<div className="flex flex-col bg-background h-full overflow-hidden">
```

2. Garantir que as bolhas de mensagem tenham `break-words` e `overflow-hidden` para textos longos.

Preciso verificar as bolhas de mensagem no código.

