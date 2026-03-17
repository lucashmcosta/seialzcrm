

## Mobile Layout para Contatos

### Estado atual
- `ContactsList` usa `Layout` (desktop sidebar) em todos os tamanhos de tela — sem detecção mobile
- Tela desktop: tabela com colunas, checkboxes, sorting, pagination, filtros (owner, stage), column selector
- Tabela não funciona em 390px — colunas ficam cortadas

### Abordagem
Mesmo padrão usado no Dashboard e Oportunidades: `useIsMobile()` → early return com `MobileLayout` + componente mobile dedicado.

### Componente mobile: estrutura

```text
┌─────────────────────────────┐
│ MobileLayout header (56px)  │
├─────────────────────────────┤
│ 🔍 Search                   │
│ 128 contatos                │
├─────────────────────────────┤
│ [Todos] [Lead] [Cliente] [Inativo]  ← scroll horizontal
├─────────────────────────────┤
│ ┌───────────────────────┐   │
│ │ Avatar  Nome          │   │
│ │         email · phone │   │
│ │         Badge: Lead   │   │
│ └───────────────────────┘   │
│ ┌───────────────────────┐   │
│ │ Contact Card          │   │
│ └───────────────────────┘   │
│ ...scroll + load more...    │
├─────────────────────────────┤
│ [+] FAB (novo contato)      │
├─────────────────────────────┤
│ Bottom tab bar (56px)       │
└─────────────────────────────┘
```

### Plano

**1. Criar `src/components/mobile/MobileContactsList.tsx`**
- Search bar no topo
- Contagem total de contatos (font-data)
- Chips horizontais para filtro de lifecycle stage (Todos, Lead, Cliente, Inativo)
- Lista vertical de cards de contato: avatar + nome + email/phone + badge de stage
- Tap no card → navega para `/contacts/:id`
- Infinite scroll com IntersectionObserver (carregar mais ao chegar no fim)
- FAB fixo para criar novo contato (`/contacts/new`)
- scrollbar-hide na lista

**2. Atualizar `src/pages/contacts/ContactsList.tsx`**
- Importar `useIsMobile` e `MobileLayout`
- Early return quando `isMobile === true` renderizando `MobileLayout` + `MobileContactsList`
- Passar dados necessários via props (contacts, loading, searchTerm, filters, handlers, totalCount)
- Manter toda a lógica de fetching no componente pai

### Arquivos afetados
| Arquivo | Mudança |
|---------|---------|
| `src/components/mobile/MobileContactsList.tsx` | **Novo** — lista mobile de contatos |
| `src/pages/contacts/ContactsList.tsx` | Adicionar detecção mobile + early return |

