# Base44 Design System - CRM SaaS

## Visão Geral

| Item | Valor |
|------|-------|
| Nome | Base44 Design System |
| Filosofia | Design limpo, profissional, estilo "pill" (arredondado) |
| Tecnologias | React, Tailwind CSS, Radix UI, Lucide Icons |
| Fonte Principal | Inter (Google Fonts) |
| Estilo Distintivo | Bordas arredondadas (pill), cores neutras com accent azul profundo |

---

## Paleta de Cores

### Cores Primárias

| Nome | HSL | Uso |
|------|-----|-----|
| Primary (Azul Elétrico) | `hsl(234, 91%, 56%)` / `#2B40F5` | Botões principais, links, ícones ativos |
| Primary Foreground | `hsl(0, 0%, 100%)` | Texto sobre primary |

### Cores de Status

| Status | Background | Texto | Classes Tailwind |
|--------|------------|-------|------------------|
| Success | `hsl(142, 76%, 89%)` | `hsl(162, 90%, 24%)` | `bg-success text-success-foreground` |
| Warning | `hsl(45, 93%, 94%)` | `hsl(28, 80%, 52%)` | `bg-amber-100 text-amber-800` |
| Danger | `hsl(0, 86%, 97%)` | `hsl(0, 74%, 42%)` | `bg-red-100 text-red-800` |
| Info | `hsl(214, 95%, 93%)` | `hsl(221, 83%, 53%)` | `bg-blue-100 text-blue-800` |
| Neutral | `hsl(210, 40%, 96%)` | `hsl(215, 16%, 47%)` | `bg-slate-100 text-slate-700` |

### Cores Neutras

| Nome | HSL | Uso |
|------|-----|-----|
| Background | `hsl(210, 20%, 98%)` | Fundo da página |
| Foreground | `hsl(217, 33%, 17%)` | Texto principal |
| Card | `hsl(0, 0%, 100%)` | Fundo de cards |
| Muted | `hsl(210, 20%, 96%)` | Fundos secundários |
| Muted Foreground | `hsl(215, 14%, 45%)` | Texto secundário |
| Border | `hsl(214, 32%, 91%)` | Bordas e divisórias |
| Input | `hsl(214, 32%, 91%)` | Bordas de inputs |

---

## Tipografia

### Hierarquia

| Elemento | Classe Tailwind | Peso | Tamanho |
|----------|-----------------|------|---------|
| Page Title | `text-3xl font-bold` | 700 | 30px |
| Section Title | `text-lg font-bold` | 700 | 18px |
| Card Title | `text-base font-semibold` | 600 | 16px |
| Section Header | `text-xs font-semibold uppercase tracking-wider` | 600 | 12px |
| Body | `text-sm font-normal` | 400 | 14px |
| Label | `text-xs font-medium` | 500 | 12px |
| Badge | `text-xs font-medium` | 500 | 12px |
| Button | `text-sm font-medium` | 500 | 14px |

---

## Border Radius (Estilo Pill)

| Elemento | Classe | Valor |
|----------|--------|-------|
| Botões | `rounded-full` | 9999px |
| Inputs | `rounded-full` | 9999px |
| Badges | `rounded-full` | 9999px |
| Tabs | `rounded-full` | 9999px |
| Search Bar | `rounded-full` | 9999px |
| Cards | `rounded-xl` | 0.75rem |
| Dropdowns | `rounded-lg` | 0.5rem |
| Modais | `rounded-lg` | 0.5rem |
| Textareas | `rounded-xl` | 0.75rem |

---

## Espaçamento

| Nome | Valor | Classes Tailwind |
|------|-------|------------------|
| xs | 0.5rem (8px) | `p-2`, `m-2`, `gap-2` |
| sm | 0.75rem (12px) | `p-3`, `m-3`, `gap-3` |
| md | 1rem (16px) | `p-4`, `m-4`, `gap-4` |
| lg | 1.5rem (24px) | `p-6`, `m-6`, `gap-6` |
| xl | 2rem (32px) | `p-8`, `m-8`, `gap-8` |

---

## Sombras

| Nome | Classe | Uso |
|------|--------|-----|
| Small | `shadow-sm` | Cards, elementos sutis |
| Medium | `shadow-md` | Dropdowns, popovers |
| Large | `shadow-lg` | Modais |
| Extra Large | `shadow-xl` | Elementos flutuantes importantes |

---

## Transições

| Tipo | Classe | Duração |
|------|--------|---------|
| Default | `transition-colors` | 200ms |
| Slow | `transition-all` | 300ms |
| Fast | `transition-all` | 150ms |

---

## Ícones (Lucide React)

### Tamanhos

| Nome | Classe | Uso |
|------|--------|-----|
| Extra Small | `w-3 h-3` | Dentro de badges pequenos |
| Small | `w-4 h-4` | Dentro de botões, badges |
| Regular | `w-5 h-5` | Ícones padrão |
| Large | `w-6 h-6` | Ícones de destaque |
| Extra Large | `w-16 h-16` | Avatares, estados vazios |

---

## Componentes Comuns

### Importação

```tsx
import { 
  StatusBadge, 
  SearchBar, 
  TabGroup, 
  ViewSwitcher, 
  PrimaryButton 
} from '@/components/common';
```

### StatusBadge

```tsx
<StatusBadge variant="success">Ativo</StatusBadge>
<StatusBadge variant="warning">Pendente</StatusBadge>
<StatusBadge variant="danger">Erro</StatusBadge>
<StatusBadge variant="info">Informação</StatusBadge>
<StatusBadge variant="neutral">Neutro</StatusBadge>
```

### SearchBar

```tsx
<SearchBar 
  value={search} 
  onChange={setSearch} 
  placeholder="Pesquisar contatos..." 
/>
```

### TabGroup

```tsx
<TabGroup
  tabs={[
    { id: 'all', label: 'Todos', badge: 10 },
    { id: 'active', label: 'Ativos' },
    { id: 'inactive', label: 'Inativos' },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

### ViewSwitcher

```tsx
<ViewSwitcher
  view={view}
  onViewChange={setView}
  views={['grid', 'list', 'kanban']}
/>
```

### PrimaryButton

```tsx
<PrimaryButton size="md" onClick={handleClick}>
  Criar Contato
</PrimaryButton>
```

---

## Tokens de Design (Cores Semânticas)

### ✅ CORRETO - Usar tokens semânticos

```tsx
<div className="bg-card text-card-foreground">
<div className="bg-primary text-primary-foreground">
<div className="text-muted-foreground">
<div className="bg-success text-success-foreground">
```

### ❌ INCORRETO - Cores diretas

```tsx
<div className="bg-white text-black">
<div className="bg-blue-500 text-white">
```

### Cores Disponíveis

- `background` / `foreground`
- `card` / `card-foreground`
- `primary` / `primary-foreground`
- `secondary` / `secondary-foreground`
- `muted` / `muted-foreground`
- `accent` / `accent-foreground`
- `destructive` / `destructive-foreground`
- `success` / `success-foreground`

---

## Headers de Página

### ✅ Fazer

- Usar apenas título principal (`<h1>`)
- Manter títulos claros e descritivos
- O título deve ser auto-explicativo

### ❌ Não Fazer

- **NÃO** usar subtítulos ou descrições abaixo do título principal
- **NÃO** adicionar textos explicativos redundantes

```tsx
// ✅ CORRETO
<h1 className="text-3xl font-bold">Dashboard</h1>

// ❌ INCORRETO
<h1 className="text-3xl font-bold">Dashboard</h1>
<p className="text-muted-foreground">Visão geral do sistema</p>
```

---

## Estrutura de Páginas - Layouts Obrigatórios

### Admin Pages (`/admin/*`)

**TODAS** as páginas admin **DEVEM** usar o `AdminLayout`:

```tsx
import { AdminLayout } from '@/components/admin/AdminLayout';

export default function AdminNovaFuncionalidade() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Título</h1>
        {/* Conteúdo */}
      </div>
    </AdminLayout>
  );
}
```

### CRM Pages (páginas do usuário)

**TODAS** as páginas do CRM **DEVEM** usar o `Layout`:

```tsx
import Layout from '@/components/Layout';

export default function MinhaFuncionalidade() {
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Título</h1>
        {/* Conteúdo */}
      </div>
    </Layout>
  );
}
```

---

## Checklist de Revisão

Antes de finalizar qualquer componente, verifique:

- [ ] Usa o Layout correto (AdminLayout ou Layout)?
- [ ] Header NÃO tem subtítulo ou descrição?
- [ ] NÃO tem padding `p-8` dentro do layout?
- [ ] Sidebar aparece corretamente?
- [ ] Cores usam tokens semânticos (não cores diretas)?
- [ ] Estilo pill está aplicado em buttons, inputs, badges?
- [ ] Fonte Inter está sendo usada?

---

## Filosofia

> "Menos é mais. Cada palavra, cada elemento deve ter um propósito claro. Se não adiciona valor, remove."

---

**Última atualização:** 2026-01-05  
**Versão:** 2.0.0 (Base44 Design System)
