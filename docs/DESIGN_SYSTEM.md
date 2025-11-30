# Design System - CRM SaaS

## Princípios de Design

Este documento define as diretrizes de design e boas práticas para manter consistência visual e experiência do usuário em todo o sistema.

---

## 1. Headers de Página

### ✅ Fazer
- Usar apenas título principal (`<h1>` ou `<h2>`)
- Manter títulos claros e descritivos
- O título deve ser auto-explicativo

### ❌ Não Fazer
- **NÃO** usar subtítulos ou descrições abaixo do título principal
- **NÃO** adicionar textos explicativos redundantes
- **NÃO** usar taglines ou slogans em headers

### Exemplos

```tsx
// ✅ CORRETO
<div>
  <h1 className="text-3xl font-bold">Dashboard</h1>
</div>

// ❌ INCORRETO
<div>
  <h1 className="text-3xl font-bold">Dashboard</h1>
  <p className="text-muted-foreground">Visão geral do sistema e métricas principais</p>
</div>
```

---

## 2. Cards

### Princípios
- Título claro e conciso
- Usar `CardDescription` apenas quando absolutamente necessário
- Evitar descrições redundantes em cards de métricas/KPIs

### Cards de KPI

```tsx
// ✅ CORRETO - Limpo e direto
<Card>
  <CardHeader>
    <CardTitle>Total de Usuários</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">1,234</div>
  </CardContent>
</Card>

// ❌ INCORRETO - Descrição desnecessária
<Card>
  <CardHeader>
    <CardTitle>Total de Usuários</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">1,234</div>
    <p className="text-xs text-muted-foreground mt-1">
      Todos os usuários cadastrados no sistema
    </p>
  </CardContent>
</Card>
```

### Cards de Formulário

```tsx
// ✅ CORRETO - CardDescription apenas quando necessário
<Card>
  <CardHeader>
    <CardTitle>Informações Pessoais</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Form fields */}
  </CardContent>
</Card>

// ⚠️ Usar apenas em casos complexos
<Card>
  <CardHeader>
    <CardTitle>Configurações Avançadas</CardTitle>
    <CardDescription>
      Estas configurações afetam o comportamento crítico do sistema
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Complex form fields */}
  </CardContent>
</Card>
```

---

## 3. Sidebars

### Princípios
- Logo + nome do sistema
- **NÃO** usar subtítulos ou taglines
- Manter navegação limpa e direta

### Exemplos

```tsx
// ✅ CORRETO
<div className="p-6 border-b">
  <h1 className="text-2xl font-bold text-primary">Portal Admin</h1>
</div>

// ❌ INCORRETO
<div className="p-6 border-b">
  <h1 className="text-2xl font-bold text-primary">Portal Admin</h1>
  <p className="text-sm text-muted-foreground">Sistema de Gerenciamento</p>
</div>
```

---

## 4. Hierarquia de Informação

### Regra de Ouro
> **Se o título precisa de explicação, o título está ruim.**

### Princípios
- Títulos devem ser auto-explicativos
- Menos texto = mais clareza
- Priorizar informação visual (ícones, badges, cores)
- Usar contexto da interface ao invés de texto

### Exemplo Prático

```tsx
// ❌ INCORRETO - Excesso de texto
<div>
  <h2>Oportunidades</h2>
  <p>Visualize e gerencie seu pipeline de vendas</p>
  <p>Arraste cards entre as colunas para mover oportunidades</p>
</div>

// ✅ CORRETO - Contexto visual
<div>
  <h2>Oportunidades</h2>
  {/* O kanban board já mostra visualmente o que fazer */}
</div>
```

---

## 5. Espaçamento e Layout

### Espaçamentos Padrão

| Elemento | Classe Tailwind | Uso |
|----------|----------------|-----|
| Headers de página | `py-4` | Padding vertical do header |
| Entre seções | `space-y-6` | Espaçamento entre seções principais |
| Dentro de cards | `p-6` | Padding interno de cards |
| Entre elementos | `gap-4` | Gap em grids e flexbox |

### Layout Consistente

```tsx
// Estrutura padrão de página
<Layout>
  <div className="flex flex-col h-full">
    {/* Header fixo */}
    <div className="border-b bg-background/95 backdrop-blur">
      <div className="px-6 py-4">
        <h1 className="text-2xl font-bold">Título da Página</h1>
      </div>
    </div>

    {/* Conteúdo scrollable */}
    <div className="flex-1 overflow-auto p-6">
      <div className="space-y-6">
        {/* Conteúdo */}
      </div>
    </div>
  </div>
</Layout>
```

---

## 6. Tokens de Design

### Cores Semânticas
Sempre usar tokens semânticos do design system definidos em `src/index.css`:

```tsx
// ✅ CORRETO - Usar tokens semânticos
<div className="bg-card text-card-foreground">
<div className="bg-primary text-primary-foreground">
<div className="text-muted-foreground">

// ❌ INCORRETO - Cores diretas
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

---

## 7. Tipografia

### Hierarquia de Títulos

| Uso | Classe | Quando Usar |
|-----|--------|-------------|
| Título principal | `text-3xl font-bold` | Página principal |
| Subtítulo grande | `text-2xl font-bold` | Headers de seção |
| Subtítulo médio | `text-xl font-semibold` | Cards importantes |
| Subtítulo pequeno | `text-lg font-semibold` | Subsections |
| Corpo normal | `text-base` | Texto padrão |
| Texto pequeno | `text-sm` | Labels, metadata |
| Texto muito pequeno | `text-xs` | Badges, hints |

---

## 8. Componentes Comuns

### Badges de Status

```tsx
// Use cores semânticas para status
<Badge className="bg-green-500 text-white">Ativo</Badge>
<Badge className="bg-red-500 text-white">Inativo</Badge>
<Badge className="bg-primary">Padrão</Badge>
```

### Botões de Ação

```tsx
// Hierarquia visual clara
<div className="flex gap-2">
  <Button>Ação Principal</Button>
  <Button variant="outline">Ação Secundária</Button>
  <Button variant="ghost">Ação Terciária</Button>
</div>
```

---

## 9. Acessibilidade

### Requisitos
- Todos os botões devem ter labels claros
- Ícones devem ter aria-labels quando usados sozinhos
- Contraste mínimo de 4.5:1 para texto normal
- Contraste mínimo de 3:1 para texto grande
- Focar estados visíveis em elementos interativos

---

## 10. Responsividade

### Breakpoints
```tsx
// Mobile first
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {/* Conteúdo */}
</div>
```

### Guidelines
- Design mobile-first
- Testar em múltiplos tamanhos de tela
- Usar grid responsivo do Tailwind
- Esconder elementos não críticos em mobile quando necessário

---

## Checklist de Revisão

Antes de finalizar qualquer componente, verifique:

- [ ] Título é claro e auto-explicativo
- [ ] Não há subtítulos ou descrições redundantes
- [ ] Cards KPI não têm descrições desnecessárias
- [ ] Sidebars não têm taglines
- [ ] Cores usam tokens semânticos
- [ ] Espaçamento está consistente
- [ ] Layout é responsivo
- [ ] Acessibilidade está garantida

---

## Mantendo o Design System

### Processo de Atualização
1. Propor mudanças neste documento
2. Revisar com o time
3. Atualizar componentes existentes
4. Documentar mudanças

### Filosofia
> "Menos é mais. Cada palavra, cada elemento deve ter um propósito claro. Se não adiciona valor, remove."

---

**Última atualização:** 2025-11-30
**Versão:** 1.1.0

---

## 11. Admin Panel - Padrões Específicos

### Dialogs de Confirmação

Para ações críticas (suspender, deletar), sempre usar dialogs de confirmação:

```tsx
// ✅ Padrão para ações destrutivas
<Dialog>
  <DialogHeader>
    <DialogTitle className="flex items-center gap-2 text-destructive">
      <AlertTriangle className="h-5 w-5" />
      Ação Crítica
    </DialogTitle>
    <DialogDescription>
      Descrição clara das consequências
    </DialogDescription>
  </DialogHeader>
  {/* Form com campos de confirmação */}
  <DialogFooter>
    <Button variant="outline">Cancelar</Button>
    <Button variant="destructive">Confirmar</Button>
  </DialogFooter>
</Dialog>
```

### Tabelas com Ações

Padrão para listagens administrativas:

```tsx
// Use DropdownMenu para ações em linhas
<TableCell className="text-right">
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem>Editar</DropdownMenuItem>
      <DropdownMenuItem className="text-destructive">Deletar</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</TableCell>
```

### Badges de Status

```tsx
// Admin-specific status badges
<Badge variant="default" className="gap-1">
  <CheckCircle className="h-3 w-3" />
  Ativo
</Badge>

<Badge variant="destructive" className="gap-1">
  <XCircle className="h-3 w-3" />
  Suspenso
</Badge>

<Badge variant="secondary" className="gap-1">
  <Shield className="h-3 w-3" />
  MFA Ativo
</Badge>
```

### Audit Logging

Sempre registrar ações administrativas críticas:

```tsx
// Após ação bem-sucedida
await supabase.from('admin_audit_logs').insert({
  admin_user_id: adminUser.id,
  action: 'suspend_organization',
  entity_type: 'organization',
  entity_id: orgId,
  details: { reason, additionalData },
});
```

### Gráficos e Visualizações

Use recharts para dashboards:

```tsx
// Padrão de gráfico responsivo
<Card>
  <CardHeader>
    <CardTitle>Título do Gráfico</CardTitle>
  </CardHeader>
  <CardContent>
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" />
      </LineChart>
    </ResponsiveContainer>
  </CardContent>
</Card>
```

### Ações Organizacionais

Interface consistente para ações em organizações:

```tsx
// Abas para organizar informações
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Visão Geral</TabsTrigger>
    <TabsTrigger value="users">Usuários</TabsTrigger>
    <TabsTrigger value="subscription">Subscription</TabsTrigger>
    <TabsTrigger value="actions">Ações</TabsTrigger>
  </TabsList>
  {/* Content */}
</Tabs>

// Aba de ações com botões claros
<Card>
  <CardHeader>
    <CardTitle>Ações Administrativas</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    <Button variant="destructive" className="w-full justify-start">
      <Icon className="h-4 w-4 mr-2" />
      Ação Crítica
    </Button>
  </CardContent>
</Card>
```

### Segurança

- **SEMPRE** verificar permissões de admin via `is_admin_user()`
- **NUNCA** confiar em dados do cliente
- Registrar todas as ações em audit logs
- Usar dialogs de confirmação dupla para ações destrutivas
- Validar entrada de usuário no backend

---

## 12. Estrutura de Páginas - Layouts Obrigatórios

### Admin Pages (`/admin/*`)

**TODAS** as páginas admin **DEVEM** usar o `AdminLayout`:

```tsx
// ✅ CORRETO - Toda página admin usa AdminLayout
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

// ❌ INCORRETO - Página admin sem AdminLayout
export default function AdminNovaFuncionalidade() {
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Título</h1>
      {/* Sidebar não vai aparecer! */}
    </div>
  );
}
```

### CRM Pages (páginas do usuário)

**TODAS** as páginas do CRM **DEVEM** usar o `Layout`:

```tsx
// ✅ CORRETO
import { Layout } from '@/components/Layout';

export default function MinhaFuncionalidade() {
  return (
    <Layout>
      {/* Conteúdo */}
    </Layout>
  );
}
```

### Regras de Padding

| Contexto | Padding | Razão |
|----------|---------|-------|
| Dentro de `AdminLayout` | **NÃO usar `p-8`** | AdminLayout já aplica padding |
| Dentro de `Layout` | **NÃO usar padding extra** | Layout já gerencia |
| Páginas públicas sem layout | Usar `p-6` ou `p-8` | Não tem wrapper |

### Checklist para Novas Páginas Admin

Antes de criar ou modificar qualquer página admin:

- [ ] Importou `AdminLayout` de `@/components/admin/AdminLayout`?
- [ ] Envolveu todo o conteúdo com `<AdminLayout>`?
- [ ] Removeu padding `p-8` do div interno?
- [ ] Header tem apenas título (sem subtítulo)?
- [ ] Testou e a sidebar aparece na página?

### Checklist para Novas Páginas CRM

Antes de criar ou modificar qualquer página CRM:

- [ ] Importou `Layout` de `@/components/Layout`?
- [ ] Envolveu todo o conteúdo com `<Layout>`?
- [ ] Removeu padding extra do div interno?
- [ ] Header segue padrão do design system?

---
