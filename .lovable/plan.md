

# Substituir header por breadcrumb permanente

## O que muda

**Arquivo**: `src/components/settings/SettingsLayout.tsx`

Remover o header completo da pagina index (botao Voltar, titulo h1 "Configuracoes", descricao). Substituir por um breadcrumb que aparece SEMPRE:

- **Na pagina index** (`/settings`): `Home > Configuracoes`
- **Numa sub-pagina** (`/settings/users`): `Home > Configuracoes > Usuarios & Permissoes`

O componente `Breadcrumbs` existente ja suporta isso. Basta renderizar o breadcrumb fora do condicional `isIndex`, com logica para adicionar o item da secao quando estiver numa rota filha.

## Resultado visual

**Index (`/settings`):**
```
Home > Configuracoes

[grid de cards]
```

**Sub-pagina (`/settings/users`):**
```
Home > Configuracoes > Usuarios & Permissoes

[conteudo da secao]
```

## Detalhes tecnicos

Substituir todo o bloco condicional `{isIndex ? (...) : (...)}` (linhas 80-106) por um unico bloco de breadcrumb:

```tsx
<div className="mb-6">
  <Breadcrumbs
    items={
      childSlug && sectionLabel
        ? [
            { label: 'Configuracoes', href: '/settings' },
            { label: sectionLabel },
          ]
        : [
            { label: 'Configuracoes' },
          ]
    }
  />
</div>
```

Remover imports nao usados: `ArrowLeft`, `useNavigate`.

| Arquivo | Mudanca |
|---------|---------|
| `src/components/settings/SettingsLayout.tsx` | Substituir header por breadcrumb permanente, remover imports |

