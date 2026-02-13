

# Ajustes visuais na pagina de Configuracoes

## 1. Cards com altura uniforme por linha

**Arquivo**: `src/components/settings/SettingsCard.tsx`

Adicionar `h-full` e reestruturar o layout interno com `flex flex-col`:
- O `<Link>` recebe `h-full` para ocupar toda a altura da celula do grid
- O wrapper interno muda de `flex items-start` para `flex flex-col` com a descricao usando `flex-1` para empurrar o conteudo para a mesma base

**Arquivo**: `src/components/settings/SettingsGrid.tsx`

Adicionar `items-stretch` no grid container (linha 165) para que todas as celulas da mesma linha tenham a mesma altura.

## 2. Transicao suave ao abrir secao

**Arquivo**: `src/components/settings/SettingsLayout.tsx`

O wrapper do `<Outlet />` na linha 109 ja tem `animate-in fade-in duration-200`, porem como o React Router reutiliza o mesmo componente SettingsLayout, a animacao so roda uma vez (na montagem). Para que o fade-in rode a cada navegacao, adicionar `key={location.pathname}` no wrapper div do Outlet. Isso forca o React a remontar o div a cada mudanca de rota, disparando a animacao CSS novamente.

## Detalhes tecnicos

### SettingsCard.tsx (linhas 17-49)

Mudar o `<Link>` para incluir `h-full` e reestruturar o flex interno:

```tsx
<Link
  to={to}
  className={cn(
    'flex flex-col w-full h-full text-left p-4 rounded-xl border border-border bg-card',
    'transition-all duration-200 group',
    'hover:border-primary/20 hover:bg-primary/5 hover:shadow-sm'
  )}
>
  <div className="flex items-start gap-3.5 flex-1">
    {/* icon div - sem mudanca */}
    <div className="flex-1 min-w-0">
      {/* label + badge - sem mudanca */}
      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed flex-1">{description}</p>
    </div>
    {/* chevron - sem mudanca */}
  </div>
</Link>
```

### SettingsGrid.tsx (linha 165)

Adicionar `items-stretch` ao grid:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
```

### SettingsLayout.tsx (linha 109)

Adicionar `key` baseado no pathname para forcar remontagem e animacao:
```tsx
<div key={location.pathname} className="animate-in fade-in duration-200">
  <Outlet />
</div>
```

## Resumo de arquivos

| Arquivo | Mudanca |
|---------|---------|
| `src/components/settings/SettingsCard.tsx` | Adicionar `h-full` e `flex flex-col` |
| `src/components/settings/SettingsGrid.tsx` | Adicionar `items-stretch` no grid |
| `src/components/settings/SettingsLayout.tsx` | Adicionar `key={location.pathname}` no wrapper do Outlet |

Nenhum arquivo novo, nenhuma dependencia nova.

