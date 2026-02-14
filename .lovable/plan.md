

# Fix: Impedir Scroll da Pagina Inteira no Modulo de Mensagens

## Causa raiz

O problema esta em duas camadas:

1. **Layout.tsx (linha 183)**: `<main className="min-h-screen">` forca o conteudo a ter no minimo a altura da viewport, permitindo que cresça alem dela e cause scroll na pagina.
2. **MessagesList.tsx (linha 844)**: `ResizablePanelGroup` tem `h-screen`, mas esta dentro do `<main>` que permite overflow -- entao a pagina inteira rola em vez de apenas as areas internas.

## Solucao

### 1. MessagesList.tsx -- Envolver tudo em container fixo

Adicionar um wrapper `div` com `h-screen overflow-hidden` ao redor do `ResizablePanelGroup` (dentro do `<Layout>`, antes do panel group). Isso garante que o modulo de mensagens nunca ultrapasse a viewport.

```
<Layout>
  <div className="h-screen overflow-hidden">
    <ResizablePanelGroup direction="horizontal" className="h-full">
      ...
    </ResizablePanelGroup>
  </div>
</Layout>
```

Mudanca: linha 844 -- trocar `className="h-screen"` do ResizablePanelGroup para `className="h-full"`, e envolver com o div fixo.

### 2. Garantir overflow-hidden nos paineis

- **Painel esquerdo (linha 847)**: Ja tem `flex flex-col h-full` -- adicionar `overflow-hidden` para evitar vazamento
- **Painel direito**: Verificar se o container do chat tambem tem `overflow-hidden`

### Nenhuma mudanca no Layout.tsx

O Layout serve outras paginas que precisam de scroll (Dashboard, Contatos, etc). A solucao e o proprio MessagesList controlar sua altura, nao alterar o Layout global.

## Arquivos afetados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/messages/MessagesList.tsx` | Envolver conteudo com `div h-screen overflow-hidden`; ajustar classes do ResizablePanelGroup e paineis |

