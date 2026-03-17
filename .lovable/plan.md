

## Mobile Contact Detail

### Problema
A tela `ContactDetail` renderiza `<Layout>` (sidebar desktop) em todas as resoluções. Em 390px, o header com avatar + botões fica apertado, as tabs desktop não cabem, e os cards de detalhe ficam cortados.

### Abordagem
Mesmo padrão: `useIsMobile()` → early return com `MobileLayout`. Não criaremos um componente separado — a lógica de dados já está no `ContactDetail`. Vamos apenas condicionar o **shell** e o **layout visual**.

### Estrutura mobile (390px)

```text
┌──────────────────────────────┐
│ MobileLayout header (56px)   │
├──────────────────────────────┤
│ ← Voltar                    │
├──────────────────────────────┤
│   [Avatar XL]                │
│   Nome do Contato            │
│   Badge: Lead                │
│   email · telefone           │
├──────────────────────────────┤
│ [Editar]  [⋯ Menu]           │
├──────────────────────────────┤
│ ▼ Select nativo (tabs)       │
│   Detalhes / Timeline / ...  │
├──────────────────────────────┤
│ Conteúdo da tab selecionada  │
│ (cards empilhados, 1 col)    │
├──────────────────────────────┤
│ Bottom tab bar (56px)        │
└──────────────────────────────┘
```

### Plano de implementação

**1. `src/pages/contacts/ContactDetail.tsx`**
- Importar `useIsMobile` e `MobileLayout`
- Checar `isMobile` antes do loading check (evitar flash do layout desktop)
- Quando `isMobile`:
  - Renderizar dentro de `<MobileLayout>` ao invés de `<Layout>`
  - **Header mobile**: botão "← Voltar" no topo, avatar centralizado abaixo, nome + badge + info de contato empilhados
  - **Ações**: botões Editar + menu ⋯ em linha, abaixo do header
  - **Tabs**: usar apenas o `<NativeSelect>` (já existe no código, só precisa mostrar sempre no mobile ao invés de esconder)
  - **Conteúdo**: manter os mesmos `Tabs.Panel` existentes — forçar grid de 1 coluna nos cards
  - Loading state mobile: `<MobileLayout>` + `<MobileSpinner>`

Não é necessário criar um arquivo novo — toda a mudança é condicional dentro do `ContactDetail.tsx` existente.

### Arquivos afetados
| Arquivo | Mudança |
|---------|---------|
| `src/pages/contacts/ContactDetail.tsx` | Adicionar branch mobile com `MobileLayout`, header compacto, e layout de 1 coluna |

