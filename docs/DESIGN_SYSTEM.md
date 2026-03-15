# Design System — Seialz CRM

## Visão Geral

O projeto suporta dois temas visuais, selecionáveis por organização:

| Tema | Descrição | Classe CSS |
|------|-----------|------------|
| **Padrão (Base44)** | Light mode, Inter, azul elétrico | Nenhuma (default) |
| **Seialz** | Dark-first, Outfit, verde accent (#00FF88) | `.theme-seialz` |

O tema é controlado via `ThemeContext` e persistido no campo `theme_preset` da tabela `organizations`.

---

## Tema Padrão (Base44)

| Item | Valor |
|------|-------|
| Filosofia | Design limpo, profissional, estilo "pill" (arredondado) |
| Fonte | Inter |
| Primary | `hsl(234, 91%, 56%)` — Azul Elétrico |
| Radius | `0.75rem` (pill) |

_(Detalhes completos no histórico do design system anterior)_

---

## Tema Seialz (v1.0)

### Fontes

| Token | Font | Uso |
|-------|------|-----|
| `--font-sans` (body) | Outfit | Todo texto da interface |
| `--font-mono` (data) | Share Tech Mono | Números, badges, timestamps |
| `--font-display` | Michroma | APENAS logo `[seialz\|]` |

Tailwind classes: `font-body`, `font-data`, `font-display`

### Cores

#### Primary
| Token | HSL | Hex | Uso |
|-------|-----|-----|-----|
| `--primary` | `153 100% 50%` | #00FF88 | CTAs, links, accent |
| `--sz-green-hover` | `153 100% 44%` | #00E07A | Hover |
| `--sz-green-dark` | `153 100% 27%` | #00884A | Accent em fundos claros |

#### Backgrounds (do mais escuro ao mais claro)
| Token | HSL | Hex | Uso |
|-------|-----|-----|-----|
| `--background` / `--sz-bg` | `240 20% 3%` | #07070A | Page bg |
| `--card` / `--sz-bg2` | `240 10% 5%` | #0C0C10 | Cards, sidebar |
| `--muted` / `--sz-bg3` | `240 8% 7%` | #111116 | Hover, inputs |
| `--popover` / `--sz-bg4` | `240 8% 10%` | #18181E | Tooltips, popovers |
| `--sz-bg5` | `240 8% 13%` | #1E1E26 | Borders fortes |

#### Texto
| Token | HSL | Hex | Uso |
|-------|-----|-----|-----|
| `--foreground` / `--sz-t1` | `240 3% 94%` | #F0F0F0 | Títulos |
| `--muted-foreground` / `--sz-t2` | `240 4% 62%` | #9A9AA6 | Body text |
| `--sz-t3` | `240 5% 37%` | #5A5A66 | Labels |
| `--sz-tm` | `240 6% 24%` | #3A3A44 | Placeholders |

#### Status
| Token | Hex | Uso |
|-------|-----|-----|
| `--success` | #00FF88 | Sucesso, ganho |
| `--warning` | #FFB800 | Atenção |
| `--destructive` | #FF4466 | Erro, perdido |
| `--sz-info` | #4488FF | Informativo |
| `--sz-purple` | #AA66FF | Destaque alternativo |

### Radius
Base: `0.375rem` (6px) — mais angular que o tema padrão.

### Ícones (Phosphor Icons)

| Peso | Quando usar |
|------|-------------|
| `light` | Padrão para toda UI |
| `bold` | CTAs, ênfase |
| `fill` | Estado ativo na navegação |

| Tamanho | Uso |
|---------|-----|
| 14px | Inline com texto |
| 16px | Botões, inputs |
| 20px | Navegação sidebar |
| 24px | Headers |
| 32px | Empty states |

### Tailwind Utilities (tema Seialz)

Cores `sz-*` disponíveis: `sz-bg`, `sz-bg2`..`sz-bg5`, `sz-t1`..`sz-tm`, `sz-green`, `sz-green-hover`, `sz-green-dark`, `sz-info`, `sz-purple`, `sz-border`, `sz-border2`.

Exemplo:
```tsx
<div className="bg-sz-bg2 text-sz-t1 border-sz-border">
  <span className="font-data text-sz-green">R$ 1.500,00</span>
</div>
```

---

## Tokens Semânticos (ambos os temas)

### ✅ CORRETO
```tsx
<div className="bg-card text-card-foreground">
<div className="bg-primary text-primary-foreground">
<div className="text-muted-foreground">
```

### ❌ INCORRETO
```tsx
<div className="bg-white text-black">
<div className="bg-blue-500 text-white">
```

### Tokens disponíveis
- `background` / `foreground`
- `card` / `card-foreground`
- `primary` / `primary-foreground`
- `secondary` / `secondary-foreground`
- `muted` / `muted-foreground`
- `accent` / `accent-foreground`
- `destructive` / `destructive-foreground`
- `success` / `success-foreground`

---

## Estrutura de Páginas

### Admin Pages (`/admin/*`)
```tsx
import { AdminLayout } from '@/components/admin/AdminLayout';

export default function AdminPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Título</h1>
      </div>
    </AdminLayout>
  );
}
```

### CRM Pages
```tsx
import Layout from '@/components/Layout';

export default function CRMPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Título</h1>
      </div>
    </Layout>
  );
}
```

---

## Checklist

- [ ] Layout correto (AdminLayout ou Layout)?
- [ ] Header SEM subtítulo?
- [ ] SEM padding extra dentro do layout?
- [ ] Cores via tokens semânticos?
- [ ] Leu este DESIGN_SYSTEM.md?

---

**Última atualização:** 2026-03-15
**Versão:** 3.0.0 (Seialz Design System v1.0)
